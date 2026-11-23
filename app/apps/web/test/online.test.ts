import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SERVER,
  inviteLink,
  parseServer,
  rejoinLink,
  resolveDefaultServer,
  socketUrl,
} from '../src/online.js';

describe('online addresses', () => {
  it('builds the socket URL for a room from the referee URL', () => {
    expect(socketUrl('https://referee.example', 'K7Q2MX')).toBe(
      'wss://referee.example/rooms/K7Q2MX/ws',
    );
    expect(socketUrl('http://localhost:8787/', 'K7Q2MX')).toBe(
      'ws://localhost:8787/rooms/K7Q2MX/ws',
    );
  });

  it('accepts only http and https server addresses', () => {
    expect(parseServer('https://referee.example/')).toBe('https://referee.example');
    expect(parseServer('http://localhost:8787')).toBe('http://localhost:8787');
    expect(parseServer('javascript:alert(1)')).toBeUndefined();
    expect(parseServer('ws://referee.example')).toBeUndefined();
    expect(parseServer('https://user:secret@referee.example')).toBeUndefined();
    expect(parseServer('not a url')).toBeUndefined();
  });

  it('refuses plain http away from this machine in a production build', () => {
    expect(parseServer('http://referee.example', true)).toBeUndefined();
    expect(parseServer('http://localhost:8787', true)).toBe('http://localhost:8787');
    expect(parseServer('http://127.0.0.1:8787', true)).toBe('http://127.0.0.1:8787');
    expect(parseServer('http://[::1]:8787', true)).toBe('http://[::1]:8787');
    expect(parseServer('https://referee.example', true)).toBe('https://referee.example');
    expect(parseServer('http://referee.example', false)).toBe('http://referee.example');
  });

  it('fails loudly in a production build without a usable default referee', () => {
    expect(() => resolveDefaultServer('http://referee.example', true)).toThrow(/VITE_REFEREE_URL/);
    expect(() => resolveDefaultServer(undefined, true)).toThrow(/VITE_REFEREE_URL/);
    expect(resolveDefaultServer('https://referee.example/', true)).toBe('https://referee.example');
    expect(resolveDefaultServer(undefined, false)).toBe('http://localhost:8787');
    expect(resolveDefaultServer('http://referee.example', false)).toBe('http://referee.example');
  });

  it('adds the server to links only when it is not the default', () => {
    const base = `${location.origin}${location.pathname}`;
    expect(inviteLink('K7Q2MX', DEFAULT_SERVER)).toBe(`${base}#/join/K7Q2MX`);
    expect(inviteLink('K7Q2MX', 'https://other.example')).toBe(
      `${base}#/join/K7Q2MX?server=https%3A%2F%2Fother.example`,
    );
    expect(rejoinLink('K7Q2MX', 'p1', DEFAULT_SERVER)).toBe(`${base}#/rejoin?code=K7Q2MX&seat=p1`);
  });
});
