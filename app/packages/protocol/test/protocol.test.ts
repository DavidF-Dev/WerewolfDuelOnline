import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Game, defaultRulesConfig, type Command, type Seat } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import {
  CLOSING_ERROR_CODES,
  FIXED_ERROR_CODES,
  isClosingErrorCode,
  MAX_MESSAGE_BYTES,
  encode,
  parseClientMessage,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from '../src/index.js';

const ROOM = 'K7Q2MX';
const TOKEN = 'ab'.repeat(16);

beforeAll(loadEngineForNode);

function okClient(raw: string): ClientMessage {
  const r = parseClientMessage(raw);
  if (!r.ok) throw new Error(`rejected: ${r.code}`);
  return r.msg;
}

describe('client messages', () => {
  it('parses each client message', () => {
    const hello: ClientMessage = {
      type: 'hello',
      protocol_version: 1,
      room: ROOM,
      seat_token: TOKEN,
      last_seq: 0,
      name: 'Ada',
    };
    expect(okClient(encode(hello))).toEqual(hello);
    expect(okClient('{"type":"hello","protocol_version":1,"room":"K7Q2MX"}')).toEqual({
      type: 'hello',
      protocol_version: 1,
      room: ROOM,
    });
    expect(okClient('{"type":"command","cmd":"next_round"}')).toEqual({
      type: 'command',
      cmd: 'next_round',
    });
    expect(okClient('{"type":"ping"}')).toEqual({ type: 'ping' });
  });

  it('rejects unknown type', () => {
    expect(parseClientMessage('{"type":"nope"}')).toEqual({ ok: false, code: 'invalid_message' });
    expect(parseClientMessage('not json')).toEqual({ ok: false, code: 'invalid_message' });
    expect(parseClientMessage('[]')).toEqual({ ok: false, code: 'invalid_message' });
  });

  it('rejects bad room code', () => {
    for (const room of ['k7q2mx', 'K7Q2M', 'K7Q2MI']) {
      const raw = JSON.stringify({ type: 'hello', protocol_version: 1, room });
      expect(parseClientMessage(raw)).toEqual({ ok: false, code: 'invalid_message' });
    }
  });

  it('rejects oversized', () => {
    const raw = JSON.stringify({ type: 'ping', pad: 'x'.repeat(9000) });
    expect(new TextEncoder().encode(raw).length).toBeGreaterThan(MAX_MESSAGE_BYTES);
    expect(parseClientMessage(raw)).toEqual({ ok: false, code: 'too_large' });
  });

  it('rejects multi-byte oversize', () => {
    const raw = JSON.stringify({ type: 'ping', pad: '€'.repeat(3000) });
    expect(raw.length).toBeLessThan(MAX_MESSAGE_BYTES);
    expect(parseClientMessage(raw)).toEqual({ ok: false, code: 'too_large' });
  });

  it('rejects an overlong string before encoding it', () => {
    const encoder = vi.spyOn(TextEncoder.prototype, 'encode');
    try {
      const raw = JSON.stringify({ type: 'ping', pad: 'x'.repeat(MAX_MESSAGE_BYTES) });
      expect(parseClientMessage(raw)).toEqual({ ok: false, code: 'too_large' });
      expect(encoder).not.toHaveBeenCalled();
    } finally {
      encoder.mockRestore();
    }
  });

  it('checks the protocol version before the rest of a hello', () => {
    const raw = JSON.stringify({ type: 'hello', protocol_version: 2, room: 'not a room' });
    expect(parseClientMessage(raw)).toEqual({ ok: false, code: 'protocol_version' });
    const current = JSON.stringify({ type: 'hello', protocol_version: 1, room: 'not a room' });
    expect(parseClientMessage(current)).toEqual({ ok: false, code: 'invalid_message' });
  });

  it('rejects non-integer protocol_version and unsafe last_seq', () => {
    const base = '"type":"hello","room":"K7Q2MX"';
    expect(parseClientMessage('{' + base + ',"protocol_version":1.5}').ok).toBe(false);
    expect(parseClientMessage('{' + base + ',"protocol_version":1e999}').ok).toBe(false);
    expect(parseClientMessage('{' + base + ',"protocol_version":1,"last_seq":1e300}').ok).toBe(
      false,
    );
  });

  it('rejects array payloads', () => {
    expect(parseClientMessage('{"type":"command","cmd":{"submit_plan":[1]}}').ok).toBe(false);
    const msg = { type: 'events', from_seq: 0, events: [], view: [1], legal: [], pending: {} };
    expect(parseServerMessage(JSON.stringify(msg)).ok).toBe(false);
  });

  it('parses large server messages without a size cap', () => {
    const msg = { type: 'game_over', replay: { pad: 'x'.repeat(20000) } };
    const raw = JSON.stringify(msg);
    expect(raw.length).toBeGreaterThan(MAX_MESSAGE_BYTES);
    expect(parseServerMessage(raw)).toEqual({ ok: true, msg });
  });

  it('rejects negative or fractional last_seq', () => {
    for (const last_seq of [-1, 1.5]) {
      const raw = JSON.stringify({ type: 'hello', protocol_version: 1, room: ROOM, last_seq });
      expect(parseClientMessage(raw)).toEqual({ ok: false, code: 'invalid_message' });
    }
  });

  it('validates names and tokens', () => {
    const hello = (extra: object) =>
      JSON.stringify({ type: 'hello', protocol_version: 1, room: ROOM, ...extra });
    expect(okClient(hello({ name: '  Ada  ' }))).toMatchObject({ name: 'Ada' });
    expect(parseClientMessage(hello({ name: '🐺'.repeat(24) })).ok).toBe(true);
    expect(parseClientMessage(hello({ name: '🐺'.repeat(25) })).ok).toBe(false);
    for (const name of [
      '',
      '   ',
      'x'.repeat(25),
      'a\u0000b',
      'a\nb',
      'a\u202eb',
      'a\u2028b',
      'a\u2029b',
    ]) {
      expect(parseClientMessage(hello({ name })).ok).toBe(false);
    }
    expect(parseClientMessage(hello({ seat_token: 'AB'.repeat(16) })).ok).toBe(false);
    expect(parseClientMessage(hello({ seat_token: 'ab' })).ok).toBe(false);
  });

  it('command accepts every engine Command shape', () => {
    const seen = new Set<string>();
    const game = Game.create('01'.repeat(32), defaultRulesConfig());
    for (let step = 0; step < 300; step += 1) {
      const seat: Seat | undefined = game.pending().seats[0];
      if (seat === undefined) break;
      const cmds: Command[] = game.legalActions(seat);
      for (const cmd of cmds) {
        seen.add(typeof cmd === 'string' ? cmd : (Object.keys(cmd)[0] ?? ''));
        expect(okClient(encode({ type: 'command', cmd }))).toEqual({ type: 'command', cmd });
      }
      const next = cmds[0];
      if (next === undefined) break;
      game.apply(seat, next);
    }
    game.dispose();

    const handWritten: Command[] = [
      { submit_plan: { character: 'seer', targets: ['fool', { character: 'wolfen' }] } },
      { place_hourglasses: { n: 1 } },
      { choose_potion_target: { card: 'villager' } },
      { hunter_spend_cross: { spend: true } },
      'next_round',
      'resign',
    ];
    for (const cmd of handWritten) {
      expect(okClient(encode({ type: 'command', cmd }))).toEqual({ type: 'command', cmd });
    }
    expect(seen.has('submit_plan')).toBe(true);
  });

  it('rejects unknown command shapes', () => {
    const bad = ['bogus', { bogus: {} }, { submit_plan: 3 }, { place_hourglasses: {}, x: {} }, 7];
    for (const cmd of bad) {
      expect(parseClientMessage(JSON.stringify({ type: 'command', cmd })).ok).toBe(false);
    }
  });
});

describe('rejoin messages', () => {
  it('round-trips rejoin, approve_rejoin and claim_win', () => {
    const msgs: ClientMessage[] = [
      { type: 'rejoin', protocol_version: 1, room: ROOM, seat: 'p1', pin: '0042', last_seq: 7 },
      { type: 'rejoin', protocol_version: 1, room: ROOM, seat: 'p0' },
      { type: 'approve_rejoin', approve: true },
      { type: 'approve_rejoin', approve: false },
      { type: 'claim_win' },
      { type: 'command', cmd: 'resign' },
    ];
    for (const msg of msgs) expect(okClient(encode(msg))).toEqual(msg);
  });

  it('rejects bad pins, seats and approvals', () => {
    const rejoin = (extra: object) =>
      JSON.stringify({ type: 'rejoin', protocol_version: 1, room: ROOM, seat: 'p0', ...extra });
    for (const pin of ['123', '12a4', '12345', '', 1234]) {
      expect(parseClientMessage(rejoin({ pin })).ok).toBe(false);
    }
    expect(parseClientMessage(rejoin({ seat: 'p2' })).ok).toBe(false);
    expect(parseClientMessage('{"type":"approve_rejoin","approve":"yes"}').ok).toBe(false);
    const welcome = { type: 'welcome', seat: 'p0', seat_token: TOKEN, room: ROOM, config: {} };
    expect(parseServerMessage(JSON.stringify({ ...welcome, pin: '12a4' })).ok).toBe(false);
    expect(parseServerMessage(JSON.stringify(welcome)).ok).toBe(false);
  });

  it('checks the protocol version of a rejoin first', () => {
    const raw = JSON.stringify({ type: 'rejoin', protocol_version: 2, room: 'bad', seat: 'x' });
    expect(parseClientMessage(raw)).toEqual({ ok: false, code: 'protocol_version' });
  });

  it('knows the new error codes', () => {
    for (const code of FIXED_ERROR_CODES) {
      expect(parseServerMessage(JSON.stringify({ type: 'error', code })).ok).toBe(true);
    }
    expect(FIXED_ERROR_CODES).toEqual(expect.arrayContaining(['unknown_seat', 'wrong_pin']));
  });

  it('lists the closing error codes among the fixed ones', () => {
    expect([...CLOSING_ERROR_CODES].sort()).toEqual(
      [
        'protocol_version',
        'rejoin_declined',
        'rejoin_unavailable',
        'room_full',
        'superseded',
        'unknown_room',
        'unknown_seat',
      ].sort(),
    );
    for (const code of CLOSING_ERROR_CODES) expect(FIXED_ERROR_CODES).toContain(code);
    expect(isClosingErrorCode('unknown_seat')).toBe(true);
    expect(isClosingErrorCode('rate_limited')).toBe(false);
    expect(isClosingErrorCode(null)).toBe(false);
  });
});

describe('server messages', () => {
  it('encode then parse round-trips every server message', () => {
    const game = Game.create('02'.repeat(32), defaultRulesConfig());
    const events = game.eventsSince(0, { seat: 'p0' });
    const msgs: ServerMessage[] = [
      {
        type: 'welcome',
        seat: 'p0',
        seat_token: TOKEN,
        room: ROOM,
        config: defaultRulesConfig(),
        pin: '0427',
      },
      { type: 'waiting' },
      {
        type: 'events',
        from_seq: 0,
        events,
        view: game.view({ seat: 'p0' }),
        legal: game.legalActions('p0'),
        pending: game.pending(),
      },
      { type: 'opponent_status', connected: true, name: 'Bo' },
      { type: 'opponent_status', connected: false },
      {
        type: 'opponent_status',
        connected: false,
        name: 'Bo',
        grace_deadline: 1_700_000_000_000,
        grace_remaining_ms: 60_000,
        can_claim_win: true,
        pin_attempt_failed: true,
      },
      { type: 'rejoin_pending' },
      { type: 'rejoin_request', deadline: 1_700_000_120_000, remaining_ms: 120_000 },
      { type: 'rejoin_withdrawn' },
      { type: 'error', code: 'pin_locked' },
      { type: 'game_over', replay: game.replay() },
      { type: 'error', code: 'room_full' },
      { type: 'error', code: 'internal_error' },
      { type: 'error', code: 'error-not-your-turn' },
      { type: 'pong' },
    ];
    for (const msg of msgs) {
      expect(parseServerMessage(encode(msg))).toEqual({ ok: true, msg });
    }
    game.dispose();
  });

  it('rejects malformed server messages', () => {
    for (const raw of [
      '{"type":"nope"}',
      '{"type":"error","code":"bogus"}',
      '{"type":"welcome","seat":"p2","seat_token":"x","room":"K7Q2MX","config":{}}',
      '{"type":"events","from_seq":0}',
      '{"type":"rejoin_request"}',
      '{"type":"rejoin_request","deadline":5}',
      '{"type":"opponent_status","connected":false,"grace_remaining_ms":-1}',
    ]) {
      expect(parseServerMessage(raw)).toEqual({ ok: false, code: 'invalid_message' });
    }
  });
});
