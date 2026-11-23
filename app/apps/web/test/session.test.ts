import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearOnlineSession,
  loadOnlineSession,
  loadSession,
  pruneOnlineSessions,
  saveOnlineSession,
  saveSession,
} from '../src/session.js';

const TOKEN = 'b'.repeat(32);
const DAY_MS = 24 * 60 * 60 * 1000;
const A = 'https://a.example';
const B = 'https://b.example';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('online sessions', () => {
  it('keeps each room in localStorage, apart from local sessions', () => {
    saveOnlineSession({ room: 'K7Q2MX', seatToken: TOKEN, server: A, lastSeq: 4 }, 1000);
    saveOnlineSession({ room: 'ABCDEF', seatToken: TOKEN, server: A, lastSeq: 9 });
    expect(loadOnlineSession(A, 'K7Q2MX')).toEqual({
      room: 'K7Q2MX',
      seatToken: TOKEN,
      server: A,
      lastSeq: 4,
      savedAt: 1000,
    });
    expect(loadOnlineSession(A, 'ABCDEF')?.lastSeq).toBe(9);
    expect(sessionStorage.length).toBe(0);
    expect(loadSession()).toBeUndefined();

    clearOnlineSession(A, 'K7Q2MX');
    expect(loadOnlineSession(A, 'K7Q2MX')).toBeUndefined();
    expect(loadOnlineSession(A, 'ABCDEF')).toBeDefined();
  });

  it('keeps the same room code on two servers apart', () => {
    saveOnlineSession({ room: 'K7Q2MX', seatToken: TOKEN, server: A, lastSeq: 1 });
    saveOnlineSession({ room: 'K7Q2MX', seatToken: 'c'.repeat(32), server: B, lastSeq: 2 });
    expect(loadOnlineSession(A, 'K7Q2MX')?.seatToken).toBe(TOKEN);
    expect(loadOnlineSession(B, 'K7Q2MX')?.lastSeq).toBe(2);
    clearOnlineSession(B, 'K7Q2MX');
    expect(loadOnlineSession(A, 'K7Q2MX')).toBeDefined();
  });

  it('keeps local sessions in sessionStorage', () => {
    saveSession({ room: 'K7Q2MX', seatToken: TOKEN, lastSeq: 2 });
    expect(localStorage.length).toBe(0);
    expect(loadSession()?.room).toBe('K7Q2MX');
  });

  it('prunes sessions older than 30 days', () => {
    const now = 100 * DAY_MS;
    saveOnlineSession(
      { room: 'OLDOLD', seatToken: TOKEN, server: A, lastSeq: 0 },
      now - 31 * DAY_MS,
    );
    saveOnlineSession({ room: 'NEWNEW', seatToken: TOKEN, server: A, lastSeq: 0 }, now - DAY_MS);
    localStorage.setItem('unrelated', 'kept');
    pruneOnlineSessions(now);
    expect(loadOnlineSession(A, 'OLDOLD')).toBeUndefined();
    expect(loadOnlineSession(A, 'NEWNEW')).toBeDefined();
    expect(localStorage.getItem('unrelated')).toBe('kept');
  });

  it('moves an entry keyed by room alone to its server key', () => {
    const now = 10 * DAY_MS;
    const old = { room: 'K7Q2MX', seatToken: TOKEN, server: A, lastSeq: 3, savedAt: now };
    localStorage.setItem('wwd.online.K7Q2MX', JSON.stringify(old));
    expect(loadOnlineSession(A, 'K7Q2MX')).toBeUndefined();
    pruneOnlineSessions(now);
    expect(localStorage.getItem('wwd.online.K7Q2MX')).toBeNull();
    expect(loadOnlineSession(A, 'K7Q2MX')).toEqual(old);
  });

  it('ignores malformed entries', () => {
    const key = `wwd.online.${encodeURIComponent(A)}.K7Q2MX`;
    localStorage.setItem(key, '{"room":"K7Q2MX"}');
    expect(loadOnlineSession(A, 'K7Q2MX')).toBeUndefined();
    localStorage.setItem(key, 'not json');
    expect(loadOnlineSession(A, 'K7Q2MX')).toBeUndefined();
  });

  it('survives storage throwing', () => {
    const fail = (): never => {
      throw new DOMException('denied', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(fail);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(fail);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(fail);
    vi.spyOn(Storage.prototype, 'key').mockImplementation(fail);
    const session = { room: 'K7Q2MX', seatToken: TOKEN, server: A, lastSeq: 0 };
    expect(() => saveOnlineSession(session)).not.toThrow();
    expect(loadOnlineSession(A, 'K7Q2MX')).toBeUndefined();
    expect(() => clearOnlineSession(A, 'K7Q2MX')).not.toThrow();
    expect(() => pruneOnlineSessions()).not.toThrow();
  });
});
