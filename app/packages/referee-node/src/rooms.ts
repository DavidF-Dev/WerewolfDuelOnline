import type { CreateRoomRequest, ErrorCode } from '@wwd/protocol';
import { Room, type Clock, type ConnId, type Outbound, type Random } from '@wwd/referee-core';
import {
  CLOSE,
  LIMITS,
  createRequestedRoom,
  errorReason as reason,
  isExpired,
  type RoomStore,
} from '@wwd/referee-service';
import type { Connection } from './connection.js';
import type { FileStore } from './file-store.js';

/** Where the referee reports room lifecycle events; never given tokens, PINs or message bodies. */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** A live room with its open connections and its deadline timer. */
export interface HostedRoom {
  readonly room: Room;
  readonly connections: Map<ConnId, Connection>;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** The room revision last queued for writing. */
  savedRevision: number;
}

export interface RoomRegistryDeps {
  files: FileStore;
  clock: Clock;
  random: Random;
  logger: Logger;
  /** Whether rooms honour the `test` options of their creation request. */
  testOverrides: boolean;
}

const HOUR_MS = 3_600_000;
// The longest delay `setTimeout` accepts; a later deadline is simply rechecked when it fires.
const MAX_TIMER_MS = 2_147_483_647;
/** Faults within `HOUR_MS` after which a room's file is quarantined. */
const FAULTS_TO_QUARANTINE = 3;

/**
 * The rooms of one referee process: creates them, loads them lazily from their snapshot files,
 * delivers their outbound messages, persists them after each change and runs their deadlines.
 */
export class RoomRegistry implements RoomStore {
  private readonly rooms = new Map<string, HostedRoom>();
  private readonly loading = new Map<string, Promise<HostedRoom | undefined>>();
  private readonly creating = new Set<string>();
  private readonly faults = new Map<string, number[]>();
  private sweeping: Promise<void> | undefined;
  private closing = false;

  constructor(private readonly deps: RoomRegistryDeps) {}

  async create(code: string, req: CreateRoomRequest): Promise<'created' | 'collision'> {
    if (this.rooms.has(code) || this.creating.has(code)) return 'collision';
    this.creating.add(code);
    try {
      if (await this.deps.files.exists(code)) return 'collision';
      const { clock, random, testOverrides } = this.deps;
      const room = createRequestedRoom(code, req, { clock, random }, testOverrides);
      try {
        await this.deps.files.write(code, room.snapshot());
      } catch (thrown) {
        room.dispose();
        throw thrown;
      }
      this.rooms.set(code, this.host(room));
      this.deps.logger.info(`room ${code} created`);
      return 'created';
    } finally {
      this.creating.delete(code);
    }
  }

  /** The live room for a code, restoring it from its snapshot file if needed. */
  async open(code: string): Promise<HostedRoom | undefined> {
    const live = this.rooms.get(code);
    if (live !== undefined) return live;
    let load = this.loading.get(code);
    if (load === undefined) {
      load = this.load(code).finally(() => this.loading.delete(code));
      this.loading.set(code, load);
    }
    return load;
  }

  /** Whether `hosted` is still the live room for its code. */
  isLive(hosted: HostedRoom): boolean {
    return !this.closing && this.isHosted(hosted);
  }

  private isHosted(hosted: HostedRoom): boolean {
    return this.rooms.get(hosted.room.code) === hosted;
  }

  handle(hosted: HostedRoom, conn: Connection, raw: string): void {
    if (!this.isLive(hosted) || !hosted.connections.has(conn.id)) return;
    let out: Outbound[];
    try {
      out = hosted.room.handle(conn.id, raw);
    } catch (thrown) {
      this.deps.logger.error(`room ${hosted.room.code} handler failed: ${reason(thrown)}`);
      conn.end(CLOSE.INTERNAL_ERROR);
      return;
    }
    this.afterChange(hosted, out);
  }

  /** Forgets a connection that has ended; later calls for the same connection do nothing. */
  disconnect(hosted: HostedRoom, conn: Connection): void {
    conn.release();
    if (!hosted.connections.delete(conn.id) || !this.isLive(hosted)) return;
    this.afterChange(hosted, hosted.room.disconnect(conn.id));
  }

  /** Deletes expired rooms, live or only on disk, and stale leftover files; never overlaps itself. */
  sweep(): Promise<void> {
    this.sweeping ??= this.sweepOnce().finally(() => {
      this.sweeping = undefined;
    });
    return this.sweeping;
  }

  /** Closes every connection, waits for pending work and releases every room. */
  async close(): Promise<void> {
    this.closing = true;
    for (const hosted of this.rooms.values()) {
      clearTimeout(hosted.timer);
      for (const conn of hosted.connections.values()) conn.end(CLOSE.GOING_AWAY);
    }
    await Promise.allSettled([...this.loading.values(), this.sweeping]);
    // Rooms stay hosted until writes already queued have taken their snapshots.
    await this.deps.files.flush();
    for (const hosted of this.rooms.values()) hosted.room.dispose();
    this.rooms.clear();
  }

  private host(room: Room): HostedRoom {
    const hosted: HostedRoom = {
      room,
      connections: new Map(),
      timer: undefined,
      savedRevision: room.revision,
    };
    this.schedule(hosted);
    return hosted;
  }

  private async load(code: string): Promise<HostedRoom | undefined> {
    await this.deps.files.settled(code);
    let room: Room;
    try {
      const snapshot = await this.deps.files.read(code);
      if (snapshot === undefined) return undefined;
      room = Room.restore(snapshot, { clock: this.deps.clock, random: this.deps.random });
    } catch (thrown) {
      this.deps.logger.error(`room ${code} could not be restored: ${reason(thrown)}`);
      return undefined;
    }
    if (this.closing) {
      room.dispose();
      return undefined;
    }
    if (isExpired(room, this.deps.clock.now())) {
      room.dispose();
      await this.deps.files.remove(code);
      this.deps.logger.info(`swept expired room ${code}`);
      return undefined;
    }
    const hosted = this.host(room);
    this.rooms.set(code, hosted);
    this.deps.logger.info(`room ${code} restored`);
    return hosted;
  }

  /** Delivers a room's output, then persists it, reschedules its deadline or drops it if faulted. */
  private afterChange(hosted: HostedRoom, out: Outbound[]): void {
    if (this.closing) return;
    this.deliver(hosted, out);
    if (!this.isLive(hosted)) return;
    if (hosted.room.faulted) {
      this.fault(hosted);
      return;
    }
    this.queueWrite(hosted);
    this.schedule(hosted);
  }

  /** Queues a write if the room has changed since the last one was queued. */
  private queueWrite(hosted: HostedRoom): void {
    const room = hosted.room;
    if (room.revision === hosted.savedRevision) return;
    hosted.savedRevision = room.revision;
    this.deps.files.schedule(room.code, () =>
      this.isHosted(hosted) && !room.faulted ? room.snapshot() : undefined,
    );
  }

  /** Sends every message, then ends the connections that were told to close. */
  private deliver(hosted: HostedRoom, out: Outbound[]): void {
    for (const o of out) hosted.connections.get(o.conn)?.send(o.msg);
    for (const o of out) if (o.close === true) hosted.connections.get(o.conn)?.end(CLOSE.NORMAL);
  }

  private schedule(hosted: HostedRoom): void {
    clearTimeout(hosted.timer);
    hosted.timer = undefined;
    const deadline = hosted.room.nextDeadline();
    if (deadline === null) return;
    const delay = Math.min(Math.max(deadline - this.deps.clock.now(), 0), MAX_TIMER_MS);
    hosted.timer = setTimeout(() => this.tick(hosted), delay);
  }

  private tick(hosted: HostedRoom): void {
    hosted.timer = undefined;
    if (!this.isLive(hosted)) return;
    let out: Outbound[];
    try {
      out = hosted.room.tick();
    } catch (thrown) {
      this.deps.logger.error(`room ${hosted.room.code} tick failed: ${reason(thrown)}`);
      this.fault(hosted);
      return;
    }
    this.afterChange(hosted, out);
  }

  /** Drops a faulted room, quarantining its file once it has faulted repeatedly. */
  private fault(hosted: HostedRoom): void {
    const code = hosted.room.code;
    this.drop(hosted, undefined, CLOSE.INTERNAL_ERROR);
    const now = this.deps.clock.now();
    const recent = (this.faults.get(code) ?? []).filter((at) => now - at < HOUR_MS);
    recent.push(now);
    this.faults.set(code, recent);
    if (recent.length < FAULTS_TO_QUARANTINE) {
      this.deps.logger.error(`room ${code} faulted and was dropped`);
      return;
    }
    this.faults.delete(code);
    this.deps.logger.error(`room ${code} faulted ${recent.length} times and was quarantined`);
    this.deps.files.quarantine(code).catch((thrown: unknown) => {
      this.deps.logger.error(`room ${code} could not be quarantined: ${reason(thrown)}`);
    });
  }

  /** Removes a room from memory and ends its connections, after an optional final error. */
  private drop(hosted: HostedRoom, notice: ErrorCode | undefined, closeCode: number): void {
    this.rooms.delete(hosted.room.code);
    clearTimeout(hosted.timer);
    for (const conn of [...hosted.connections.values()]) {
      if (notice !== undefined) conn.send({ type: 'error', code: notice });
      conn.end(closeCode);
    }
    hosted.connections.clear();
    hosted.room.dispose();
  }

  private async sweepOnce(): Promise<void> {
    const now = this.deps.clock.now();
    let swept = 0;
    for (const hosted of [...this.rooms.values()]) {
      if (!isExpired(hosted.room, now)) continue;
      this.drop(hosted, 'room_closed', CLOSE.NORMAL);
      await this.deps.files.remove(hosted.room.code);
      swept += 1;
    }
    for (const code of await this.deps.files.codes()) {
      if (this.rooms.has(code) || this.loading.has(code) || this.creating.has(code)) continue;
      try {
        if (!(await this.fileExpired(code, now))) continue;
        await this.deps.files.remove(code);
        swept += 1;
      } catch (thrown) {
        this.deps.logger.warn(`room ${code} not swept: ${reason(thrown)}`);
      }
    }
    const stale = await this.deps.files.removeStale(Date.now(), {
      temp: HOUR_MS,
      quarantined: LIMITS.FINISHED_ROOM_TTL_MS,
    });
    if (swept > 0 || stale > 0) {
      this.deps.logger.info(`swept ${swept} expired room(s) and ${stale} stale file(s)`);
    }
  }

  /** Whether a room known only from its file has expired; a v1 file is aged by its write time. */
  private async fileExpired(code: string, now: number): Promise<boolean> {
    const snapshot = await this.deps.files.read(code);
    if (snapshot === undefined) return false;
    if (snapshot.version === 1) {
      const written = await this.deps.files.modifiedAt(code);
      return isExpired({ lastActivityAt: written, finishedAt: null }, Date.now());
    }
    return isExpired(
      { lastActivityAt: snapshot.last_activity_at, finishedAt: snapshot.finished_at },
      now,
    );
  }
}
