import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultRulesConfig } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import { PROTOCOL_VERSION, encode } from '@wwd/protocol';
import { PIN_LOCK_MS, PIN_MAX_FAILURES, Room } from '../src/index.js';
import { Driver, ROOM_CODE, deps, hello, type FakeClock } from './harness.js';

beforeAll(loadEngineForNode);

const rooms: Room[] = [];

afterEach(() => {
  for (const room of rooms.splice(0)) room.dispose();
});

function started(): { room: Room; clock: FakeClock; driver: Driver } {
  const d = deps();
  const room = Room.create(ROOM_CODE, defaultRulesConfig(), d, { graceMs: 3_600_000 });
  rooms.push(room);
  const driver = new Driver(room, d.clock, 'a', 'b');
  driver.send('a', hello());
  driver.send('b', hello());
  return { room, clock: d.clock, driver };
}

function wrongPin(pin: string): string {
  return encode({
    type: 'rejoin',
    protocol_version: PROTOCOL_VERSION,
    room: ROOM_CODE,
    seat: 'p1',
    pin,
  });
}

describe('Room revision', () => {
  it('does not change on a ping or invalid input', () => {
    const { room, driver } = started();
    const before = room.revision;
    driver.send('a', encode({ type: 'ping' }));
    driver.send('a', '{ not json');
    driver.send('a', encode({ type: 'claim_win' }));
    driver.send('z', encode({ type: 'ping' }));
    expect(room.revision).toBe(before);
  });

  it('changes on a command', () => {
    const { room, driver } = started();
    const before = room.revision;
    driver.step();
    expect(room.revision).toBeGreaterThan(before);
  });

  it('changes on a wrong PIN', () => {
    const { room, driver } = started();
    driver.room.disconnect('b');
    const before = room.revision;
    const out = driver.send('c', wrongPin('0000'));
    const wrong = out.find((o) => o.msg.type === 'error');
    // Guards against the seeded PIN happening to be 0000, which would grant the seat instead.
    expect(wrong?.msg).toEqual({ type: 'error', code: 'wrong_pin' });
    expect(room.revision).toBeGreaterThan(before);
  });

  it('changes on disconnect', () => {
    const { room } = started();
    const before = room.revision;
    room.disconnect('b');
    expect(room.revision).toBeGreaterThan(before);
  });

  it('changes on a tick that expires something, and not on one that does not', () => {
    const { room, clock, driver } = started();
    room.disconnect('b');
    for (let i = 0; i <= PIN_MAX_FAILURES; i++) driver.send('c', wrongPin('0000'));
    let before = room.revision;
    room.tick();
    expect(room.revision).toBe(before);

    clock.advance(PIN_LOCK_MS);
    before = room.revision;
    room.tick();
    expect(room.revision).toBeGreaterThan(before);
  });
});
