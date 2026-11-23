import type { RulesConfig } from '@wwd/engine';
import { encode, parseClientMessage, type ErrorCode } from '@wwd/protocol';
import {
  Room,
  closesConnection,
  generateJoinCode,
  type Clock,
  type ConnId,
  type Outbound,
  type Random,
} from '@wwd/referee-core';
import type { Transport } from '@wwd/transport';

const MAX_CODE_ATTEMPTS = 16;

const defaultClock: Clock = { now: () => Date.now() };
const defaultRandom: Random = {
  bytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
};

interface Connection {
  transport: Transport;
  room: Room | undefined;
  unsubscribe: Array<() => void>;
}

/**
 * An in-process referee: hosts rooms and serves any number of `Transport` connections.
 * A connection is routed to a room by the `room` field of its first valid `hello` or `rejoin`.
 */
export class MemoryReferee {
  private readonly clock: Clock;
  private readonly random: Random;
  private readonly rooms = new Map<string, Room>();
  private readonly connections = new Map<ConnId, Connection>();
  private nextConn = 1;

  constructor(deps: { clock?: Clock; random?: Random } = {}) {
    this.clock = deps.clock ?? defaultClock;
    this.random = deps.random ?? defaultRandom;
  }

  /** Creates a room and returns its join code; throws if the engine rejects `config`. */
  createRoom(config: RulesConfig): string {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateJoinCode(this.random);
      if (this.rooms.has(code)) continue;
      this.rooms.set(code, Room.create(code, config, { clock: this.clock, random: this.random }));
      return code;
    }
    throw new Error('could not allocate a unique join code');
  }

  /** Adopts the server end of a connection. */
  accept(transport: Transport): void {
    const conn: ConnId = `m${this.nextConn++}`;
    const connection: Connection = { transport, room: undefined, unsubscribe: [] };
    this.connections.set(conn, connection);
    connection.unsubscribe.push(
      transport.onMessage((text) => this.receive(conn, connection, text)),
      transport.onClose(() => this.drop(conn)),
    );
  }

  /** Closes every connection and disposes every room. */
  close(): void {
    for (const [conn, connection] of [...this.connections]) {
      this.drop(conn);
      connection.transport.close();
    }
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }

  private receive(conn: ConnId, connection: Connection, text: string): void {
    if (!this.connections.has(conn)) return;
    if (connection.room === undefined) {
      const parsed = parseClientMessage(text);
      if (!parsed.ok) {
        this.refuse(conn, parsed.code);
        return;
      }
      if (parsed.msg.type !== 'hello' && parsed.msg.type !== 'rejoin') {
        this.refuse(conn, 'not_joined');
        return;
      }
      const room = this.rooms.get(parsed.msg.room);
      if (room === undefined) {
        this.refuse(conn, 'unknown_room');
        return;
      }
      connection.room = room;
    }
    this.deliver(connection.room.handle(conn, text));
  }

  private drop(conn: ConnId): void {
    const connection = this.connections.get(conn);
    if (connection === undefined) return;
    this.connections.delete(conn);
    for (const off of connection.unsubscribe) off();
    if (connection.room !== undefined) this.deliver(connection.room.disconnect(conn));
  }

  private reply(connection: Connection, msg: Outbound['msg']): void {
    connection.transport.send(encode(msg));
  }

  /** Answers a connection that has no room yet with an error. */
  private refuse(conn: ConnId, code: ErrorCode): void {
    const out: Outbound = { conn, msg: { type: 'error', code } };
    this.deliver([closesConnection(code) ? { ...out, close: true } : out]);
  }

  /** Sends every message, then closes the connections that were told to close. */
  private deliver(out: Outbound[]): void {
    const closing: Transport[] = [];
    for (const o of out) {
      const target = this.connections.get(o.conn);
      if (target === undefined) continue;
      this.reply(target, o.msg);
      if (o.close === true) closing.push(target.transport);
    }
    for (const transport of closing) transport.close();
  }
}
