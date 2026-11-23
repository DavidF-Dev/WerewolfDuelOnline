import type { Command, Seat, View } from '@wwd/engine';
import { PROTOCOL_VERSION, encode, type ClientMessage, type ServerMessage } from '@wwd/protocol';
import type { Clock, ConnId, Outbound, Random, Room } from '../src/index.js';

export const ROOM_CODE = 'K7Q2MX';

export class FakeClock implements Clock {
  constructor(public time = 1_000_000) {}
  now(): number {
    return this.time;
  }
  advance(ms: number): void {
    this.time += ms;
  }
}

/** A deterministic `Random` driven by a 32-bit xorshift generator. */
export class FakeRandom implements Random {
  private state: number;
  constructor(seed = 0x9e3779b9) {
    this.state = seed >>> 0 || 1;
  }
  bytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let x = this.state;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      this.state = x >>> 0;
      out[i] = this.state & 0xff;
    }
    return out;
  }
}

export function deps(seed?: number): { clock: FakeClock; random: FakeRandom } {
  return { clock: new FakeClock(), random: new FakeRandom(seed) };
}

export function hello(extra: Partial<Extract<ClientMessage, { type: 'hello' }>> = {}): string {
  return encode({ type: 'hello', protocol_version: PROTOCOL_VERSION, room: ROOM_CODE, ...extra });
}

export function command(cmd: Command): string {
  return encode({ type: 'command', cmd });
}

export function to(out: Outbound[], conn: ConnId): ServerMessage[] {
  return out.filter((o) => o.conn === conn).map((o) => o.msg);
}

export type EventsMessage = Extract<ServerMessage, { type: 'events' }>;
export type GameOverMessage = Extract<ServerMessage, { type: 'game_over' }>;

export function isGameOver(view: View): boolean {
  return typeof view.phase === 'object' && 'game_over' in view.phase;
}

/** Drives a room through its connections by sending a seeded random choice of legal command. */
export class Driver {
  readonly log: Outbound[] = [];
  readonly latest = new Map<ConnId, EventsMessage>();
  readonly conns: Record<Seat, ConnId>;
  private readonly choices: FakeRandom;

  constructor(
    public room: Room,
    private readonly clock: FakeClock,
    p0: ConnId,
    p1: ConnId,
    seed = 0x5eed,
  ) {
    this.conns = { p0, p1 };
    this.choices = new FakeRandom(seed);
  }

  /** Sends one message, spacing messages out so the room's rate limit never applies. */
  send(conn: ConnId, raw: string): Outbound[] {
    this.clock.advance(1000);
    const out = this.room.handle(conn, raw);
    this.record(out);
    return out;
  }

  record(out: Outbound[]): void {
    for (const o of out) {
      this.log.push(o);
      if (o.msg.type === 'events') this.latest.set(o.conn, o.msg);
    }
  }

  view(seat: Seat): View {
    const latest = this.latest.get(this.conns[seat]);
    if (latest === undefined) throw new Error(`no events for ${seat}`);
    return latest.view;
  }

  /** Sends one legal command; returns false once the game is over. */
  step(): boolean {
    for (const seat of ['p0', 'p1'] as const) {
      const latest = this.latest.get(this.conns[seat]);
      if (latest === undefined) throw new Error(`no events for ${seat}`);
      if (isGameOver(latest.view)) return false;
      if (latest.legal.length === 0) continue;
      const cmd = latest.legal[this.choices.bytes(1)[0]! % latest.legal.length]!;
      const out = this.send(this.conns[seat], command(cmd));
      const error = out.find((o) => o.msg.type === 'error');
      if (error !== undefined) throw new Error(`command rejected: ${JSON.stringify(error.msg)}`);
      return true;
    }
    throw new Error('no seat has a legal command');
  }

  playUntil(done: () => boolean, limit = 5000): void {
    for (let i = 0; i < limit; i++) {
      if (done() || !this.step()) return;
    }
    throw new Error('game did not finish');
  }
}
