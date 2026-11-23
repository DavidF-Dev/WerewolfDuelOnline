import { DurableObject } from 'cloudflare:workers';
import wasm from '@wwd/engine/wasm';
import { initEngine, type Seat } from '@wwd/engine';
import { encode, type CreateRoomRequest, type ServerMessage } from '@wwd/protocol';
import {
  Room,
  type Clock,
  type ConnId,
  type Outbound,
  type Random,
  type RoomSnapshot,
} from '@wwd/referee-core';
import {
  CLOSE,
  LIMITS,
  createRequestedRoom,
  errorReason as reason,
  errorResponse,
  expiresAt,
  isExpired,
} from '@wwd/referee-service';
import type { Env } from './worker.js';

/** The internal requests a room's object answers; none is reachable from outside the Worker. */
export const ROOM_URLS = {
  init: 'https://room.internal/init',
  socket: 'https://room.internal/socket',
} as const;

/** The body of an internal room-creation request. */
export interface InitRequest {
  code: string;
  request: CreateRoomRequest;
}

/** The frames the runtime answers itself, without waking the object; equal to `encode`'s output. */
export const PING_FRAME = '{"type":"ping"}';
export const PONG_FRAME = '{"type":"pong"}';

const KEY = {
  room: 'room',
  faults: 'faults',
  quarantinedAt: 'quarantined_at',
  cleanupAt: 'cleanup_at',
} as const;

const HOUR_MS = 3_600_000;
/** Faults within `HOUR_MS` after which a room is quarantined. */
const FAULTS_TO_QUARANTINE = 3;
/** How soon a room dropped after a fault is woken again to resume its deadlines. */
const FAULT_RECOVERY_MS = 60_000;
// A UTF-8 encoding takes at most three bytes per UTF-16 code unit.
const MAX_BYTES_PER_CODE_UNIT = 3;

/** What each socket carries across hibernation. */
interface Attachment {
  conn: ConnId;
  acceptedAt: number;
  /** When the socket last sent a frame that reached the object. */
  lastMessageAt: number;
  /** The seat the socket has been welcomed to, and when. */
  seat?: Seat;
  welcomedAt?: number;
  /** Set while the socket waits for the opponent to answer its rejoin request. */
  pending?: true;
}

const clock: Clock = { now: () => Date.now() };
const systemRandom: Random = { bytes: (n) => crypto.getRandomValues(new Uint8Array(n)) };
const decoder = new TextDecoder();
const encoder = new TextEncoder();

/**
 * Completes an upgrade only to say the room is unknown and close with 1008, so a browser learns
 * why rather than seeing a dropped connection. The socket is not hibernatable and never counts
 * towards the object's sockets.
 */
function turnAway(): Response {
  const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
  server.accept();
  server.send(encode({ type: 'error', code: 'unknown_room' }));
  server.close(CLOSE.POLICY_VIOLATION);
  return new Response(null, { status: 101, webSocket: client });
}

function attachmentOf(ws: WebSocket): Attachment | null {
  return ws.deserializeAttachment() as Attachment | null;
}

function isOversized(message: string | ArrayBuffer): boolean {
  if (typeof message !== 'string') return message.byteLength > LIMITS.MAX_FRAME_BYTES;
  if (message.length * MAX_BYTES_PER_CODE_UNIT <= LIMITS.MAX_FRAME_BYTES) return false;
  return encoder.encode(message).byteLength > LIMITS.MAX_FRAME_BYTES;
}

/**
 * One room, hosted with the WebSocket Hibernation API. The room is rebuilt from storage whenever
 * the object wakes, each socket's seat travels in its attachment, and a single alarm runs the
 * room's deadlines, socket timeouts and expiry.
 */
export class RoomObject extends DurableObject<Env> {
  private room: Room | undefined;
  /** The room revision last written to storage. */
  private savedRevision = -1;
  /** The alarm time last set, `null` for none, or `undefined` when not yet read. */
  private alarmAt: number | null | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING_FRAME, PONG_FRAME));
  }

  override async fetch(request: Request): Promise<Response> {
    const url = request.url;
    if (url === ROOM_URLS.socket && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      return this.accept();
    }
    if (url === ROOM_URLS.init && request.method === 'POST') {
      return this.init(await request.json());
    }
    return errorResponse(404, 'not_found');
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = attachmentOf(ws);
    if (attachment === null) {
      ws.close(CLOSE.POLICY_VIOLATION);
      return;
    }
    attachment.lastMessageAt = clock.now();
    ws.serializeAttachment(attachment);
    const room = await this.ensureRoom();
    if (room === undefined) {
      this.send(ws, { type: 'error', code: 'room_closed' });
      ws.close(CLOSE.GOING_AWAY);
      return;
    }
    if (isOversized(message)) {
      await this.afterChange(room, this.end(ws, CLOSE.MESSAGE_TOO_BIG));
      return;
    }
    let out: Outbound[];
    try {
      out = room.handle(
        attachment.conn,
        typeof message === 'string' ? message : decoder.decode(message),
      );
    } catch (thrown) {
      console.error(`room ${room.code} connection failed: ${reason(thrown)}`);
      out = this.end(ws, CLOSE.INTERNAL_ERROR);
    }
    await this.afterChange(room, out);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.forget(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.forget(ws);
  }

  override async alarm(): Promise<void> {
    this.alarmAt = null;
    const room = await this.ensureRoom();
    const now = clock.now();
    if (room === undefined) {
      await this.cleanUp(now);
      return;
    }
    if (isExpired(room, now)) {
      await this.expire(room);
      return;
    }
    const out = this.closeLapsed(now);
    try {
      out.push(...room.tick());
    } catch (thrown) {
      console.error(`room ${room.code} tick failed: ${reason(thrown)}`);
      await this.fault(room);
      return;
    }
    await this.afterChange(room, out);
  }

  private async init(body: InitRequest): Promise<Response> {
    await initEngine(wasm);
    if (await this.isKnown()) return new Response(null, { status: 409 });
    const { code, request } = body;
    const testOverrides = this.env.TEST_OVERRIDES === '1';
    const room = createRequestedRoom(code, request, { clock, random: systemRandom }, testOverrides);
    await this.ctx.storage.put(KEY.room, room.snapshot());
    this.room = room;
    this.savedRevision = room.revision;
    await this.schedule(room);
    console.info(`room ${code} created`);
    return new Response(null, { status: 201 });
  }

  private async isKnown(): Promise<boolean> {
    if (this.room !== undefined) return true;
    const stored = await this.ctx.storage.get([KEY.room, KEY.quarantinedAt]);
    return stored.size > 0;
  }

  private async accept(): Promise<Response> {
    const room = await this.ensureRoom();
    if (room === undefined) return turnAway();
    const now = clock.now();
    const lapsed = this.closeLapsed(now);
    if (this.openSockets().length >= LIMITS.MAX_CONNECTIONS_PER_ROOM) {
      await this.afterChange(room, lapsed);
      return errorResponse(503, 'too_many_connections');
    }
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    const attachment: Attachment = {
      conn: crypto.randomUUID(),
      acceptedAt: now,
      lastMessageAt: now,
    };
    server.serializeAttachment(attachment);
    await this.afterChange(room, lapsed);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** The live room, restored from storage if the object has none in memory. */
  private async ensureRoom(): Promise<Room | undefined> {
    if (this.room !== undefined) return this.room;
    return this.ctx.blockConcurrencyWhile(() => this.load());
  }

  /**
   * Restores the stored room as it was before the object slept, rebinds every seated socket to its
   * seat and closes the sockets the room cannot know: those without an attachment, a second socket
   * holding the same seat, and any waiting on a rejoin request the room no longer has.
   */
  private async load(): Promise<Room | undefined> {
    if (this.room !== undefined) return this.room;
    await initEngine(wasm);
    const snapshot = await this.ctx.storage.get<RoomSnapshot>(KEY.room);
    if (snapshot === undefined) return undefined;
    let room: Room;
    try {
      room = Room.restore(snapshot, { clock, random: systemRandom }, { wake: true });
    } catch {
      console.error('a stored room could not be restored');
      this.alarmAt ??= await this.ctx.storage.getAlarm();
      if (this.alarmAt === null) await this.setAlarm(await this.cleanupAt(snapshot));
      return undefined;
    }
    if (isExpired(room, clock.now())) {
      await this.expire(room);
      return undefined;
    }
    this.room = room;
    const out: Outbound[] = [];
    for (const [seat, holder] of this.seatHolders(snapshot.pending_rejoin?.conn)) {
      out.push(...room.rebind(holder.conn, seat));
    }
    out.push(...this.closeLapsed(clock.now()));
    // A room exactly as stored needs no write, and its sockets already know its state.
    if (JSON.stringify(room.snapshot()) === JSON.stringify(snapshot)) {
      this.savedRevision = room.revision;
      out.length = 0;
    } else {
      this.savedRevision = -1;
    }
    await this.afterChange(room, out);
    return this.room;
  }

  /**
   * The attachment of the socket holding each seat, the most recently welcomed one when several
   * claim it; closes every other socket that cannot stay, keeping the asker `pendingConn`.
   */
  private seatHolders(pendingConn: ConnId | undefined): Map<Seat, Attachment> {
    const holders = new Map<Seat, { ws: WebSocket; attachment: Attachment }>();
    for (const ws of this.openSockets()) {
      const attachment = attachmentOf(ws);
      if (attachment === null) {
        ws.close(CLOSE.POLICY_VIOLATION);
      } else if (attachment.seat !== undefined) {
        const held = holders.get(attachment.seat);
        if (
          held !== undefined &&
          (held.attachment.welcomedAt ?? 0) > (attachment.welcomedAt ?? 0)
        ) {
          this.supersede(ws);
          continue;
        }
        if (held !== undefined) this.supersede(held.ws);
        holders.set(attachment.seat, { ws, attachment });
      } else if (attachment.pending === true && attachment.conn !== pendingConn) {
        this.end(ws, CLOSE.GOING_AWAY);
      }
    }
    const seats = new Map<Seat, Attachment>();
    for (const [seat, held] of holders) seats.set(seat, held.attachment);
    return seats;
  }

  private supersede(ws: WebSocket): void {
    this.send(ws, { type: 'error', code: 'superseded' });
    this.end(ws, CLOSE.NORMAL);
  }

  /** Delivers a room's output, then persists it and reschedules its alarm, or drops it if faulted. */
  private async afterChange(room: Room, out: Outbound[]): Promise<void> {
    this.deliver(out);
    if (this.room !== room) return;
    if (room.faulted) {
      await this.fault(room);
      return;
    }
    if (room.revision !== this.savedRevision) {
      this.savedRevision = room.revision;
      await this.ctx.storage.put(KEY.room, room.snapshot());
    }
    await this.schedule(room);
  }

  /** Sends every message, then ends the sockets that were told to close, delivering what follows. */
  private deliver(out: Outbound[]): void {
    if (out.length === 0) return;
    const sockets = new Map<ConnId, WebSocket>();
    for (const ws of this.openSockets()) {
      const attachment = attachmentOf(ws);
      if (attachment !== null) sockets.set(attachment.conn, ws);
    }
    let batch = out;
    while (batch.length > 0) {
      for (const o of batch) {
        const ws = sockets.get(o.conn);
        if (ws !== undefined) this.send(ws, o.msg);
      }
      const next: Outbound[] = [];
      for (const o of batch) {
        const ws = o.close === true ? sockets.get(o.conn) : undefined;
        if (ws === undefined) continue;
        sockets.delete(o.conn);
        next.push(...this.end(ws, CLOSE.NORMAL));
      }
      batch = next;
    }
  }

  /** Sends one message, recording in the socket's attachment any seat it is welcomed to. */
  private send(ws: WebSocket, msg: ServerMessage): void {
    if (msg.type === 'welcome' || msg.type === 'rejoin_pending') {
      const attachment = attachmentOf(ws);
      if (attachment !== null) {
        if (msg.type === 'welcome') {
          attachment.seat = msg.seat;
          attachment.welcomedAt = clock.now();
          delete attachment.pending;
        } else {
          attachment.pending = true;
        }
        ws.serializeAttachment(attachment);
      }
    }
    try {
      ws.send(encode(msg));
    } catch {
      // The peer has already gone; its close event unbinds it.
    }
  }

  /** Closes a socket and unbinds it at once, returning what the room says about its leaving. */
  private end(ws: WebSocket, code: number): Outbound[] {
    const attachment = attachmentOf(ws);
    if (attachment !== null && (attachment.seat !== undefined || attachment.pending === true)) {
      ws.serializeAttachment({
        conn: attachment.conn,
        acceptedAt: attachment.acceptedAt,
        lastMessageAt: attachment.lastMessageAt,
      } satisfies Attachment);
    }
    try {
      ws.close(code);
    } catch {
      // Already closed.
    }
    if (attachment === null || this.room === undefined) return [];
    return this.room.disconnect(attachment.conn);
  }

  /** Unbinds a socket the peer has closed or that failed. */
  private async forget(ws: WebSocket): Promise<void> {
    const attachment = attachmentOf(ws);
    if (attachment === null) return;
    const room = await this.ensureRoom();
    if (room === undefined) return;
    await this.afterChange(room, room.disconnect(attachment.conn));
  }

  /** Ends sockets that have gone idle or have not been welcomed in time. */
  private closeLapsed(now: number): Outbound[] {
    const out: Outbound[] = [];
    for (const ws of this.openSockets()) {
      const attachment = attachmentOf(ws);
      if (attachment === null) continue;
      if (now >= this.idleDeadline(ws, attachment)) {
        out.push(...this.end(ws, CLOSE.GOING_AWAY));
      } else if (now >= this.helloDeadline(attachment)) {
        out.push(...this.end(ws, CLOSE.POLICY_VIOLATION));
      }
    }
    return out;
  }

  // Answered pings never reach the object, so the runtime's timestamp of the last one counts too.
  private idleDeadline(ws: WebSocket, attachment: Attachment): number {
    const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
    return Math.max(attachment.lastMessageAt, pinged) + LIMITS.IDLE_TIMEOUT_MS;
  }

  private helloDeadline(attachment: Attachment): number {
    if (attachment.seat !== undefined || attachment.pending === true) return Infinity;
    return attachment.acceptedAt + LIMITS.PRE_HELLO_TIMEOUT_MS;
  }

  private openSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN);
  }

  /** Sets the alarm for the room's next deadline, socket timeout or expiry, whichever is first. */
  private async schedule(room: Room): Promise<void> {
    let at = expiresAt(room);
    const deadline = room.nextDeadline();
    if (deadline !== null) at = Math.min(at, deadline);
    for (const ws of this.openSockets()) {
      const attachment = attachmentOf(ws);
      if (attachment === null) continue;
      at = Math.min(at, this.idleDeadline(ws, attachment), this.helloDeadline(attachment));
    }
    this.alarmAt ??= await this.ctx.storage.getAlarm();
    // An alarm that fires early finds nothing due and reschedules, which costs less than a write per message.
    if (this.alarmAt !== null && this.alarmAt <= at && this.alarmAt > clock.now()) return;
    await this.setAlarm(at);
  }

  private async setAlarm(at: number): Promise<void> {
    await this.ctx.storage.setAlarm(at);
    this.alarmAt = at;
  }

  /** Tells every socket the room has closed, then deletes the room and everything stored with it. */
  private async expire(room: Room): Promise<void> {
    for (const ws of this.openSockets()) {
      this.send(ws, { type: 'error', code: 'room_closed' });
      ws.close(CLOSE.NORMAL);
    }
    this.release(room);
    await this.wipe();
    console.info(`swept expired room ${room.code}`);
  }

  /** Removes everything stored once a room that cannot be served is past its retention. */
  private async cleanUp(now: number): Promise<void> {
    const stored = await this.ctx.storage.get(KEY.room);
    const quarantinedAt = await this.ctx.storage.get<number>(KEY.quarantinedAt);
    let at: number;
    if (stored !== undefined) at = await this.cleanupAt(stored);
    else if (quarantinedAt !== undefined) at = quarantinedAt + LIMITS.FINISHED_ROOM_TTL_MS;
    else at = now;
    if (now < at) {
      await this.setAlarm(at);
      return;
    }
    await this.wipe();
    if (stored !== undefined) console.info('removed a stored room that could not be restored');
  }

  /** When a stored room that cannot be restored is removed: at its idle expiry if readable. */
  private async cleanupAt(stored: unknown): Promise<number> {
    const last = (stored as { last_activity_at?: unknown } | null)?.last_activity_at;
    if (typeof last === 'number' && Number.isFinite(last)) return last + LIMITS.IDLE_ROOM_TTL_MS;
    const recorded = await this.ctx.storage.get<number>(KEY.cleanupAt);
    if (recorded !== undefined) return recorded;
    const at = clock.now() + LIMITS.FINISHED_ROOM_TTL_MS;
    await this.ctx.storage.put(KEY.cleanupAt, at);
    return at;
  }

  private async wipe(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.alarmAt = null;
  }

  /** Drops a faulted room without saving it, quarantining it once it has faulted repeatedly. */
  private async fault(room: Room): Promise<void> {
    this.release(room);
    for (const ws of this.openSockets()) ws.close(CLOSE.INTERNAL_ERROR);
    const now = clock.now();
    const faults = (await this.ctx.storage.get<number[]>(KEY.faults)) ?? [];
    const recent = faults.filter((at) => now - at < HOUR_MS);
    recent.push(now);
    if (recent.length < FAULTS_TO_QUARANTINE) {
      await this.ctx.storage.put(KEY.faults, recent);
      await this.setAlarm(now + FAULT_RECOVERY_MS);
      console.error(`room ${room.code} faulted and was dropped`);
      return;
    }
    console.error(`room ${room.code} faulted ${recent.length} times and was quarantined`);
    await this.quarantine(room.code);
  }

  /** Deletes the room's snapshot and keeps a marker, so it is no longer served, until it expires. */
  private async quarantine(code: string): Promise<void> {
    for (const ws of this.openSockets()) ws.close(CLOSE.INTERNAL_ERROR);
    const now = clock.now();
    await this.ctx.storage.delete([KEY.room, KEY.faults]);
    await this.ctx.storage.put(KEY.quarantinedAt, now);
    await this.setAlarm(now + LIMITS.FINISHED_ROOM_TTL_MS);
    console.info(`room ${code} will be removed after its quarantine`);
  }

  private release(room: Room): void {
    if (this.room === room) this.room = undefined;
    this.savedRevision = -1;
    room.dispose();
  }
}
