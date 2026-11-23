import type { ServerMessage } from '@wwd/protocol';

/** Milliseconds since the Unix epoch. */
export interface Clock {
  now(): number;
}

/** A source of cryptographically secure random bytes. */
export interface Random {
  bytes(n: number): Uint8Array;
}

/** An adapter-assigned identifier for one live connection. */
export type ConnId = string;

export interface Outbound {
  conn: ConnId;
  msg: ServerMessage;
  /** Set when the adapter must close `conn` once `msg` has been delivered. */
  close?: true;
}

export interface RoomDeps {
  clock: Clock;
  random: Random;
}

export interface RoomOptions {
  /** How long a seat may stay disconnected mid-game before its opponent may claim the win. */
  graceMs: number;
}

export interface RestoreOptions {
  /**
   * Set when the adapter's connections outlived the room's last in-memory copy, as when a
   * hibernated object wakes: grace windows keep their stored start and a pending rejoin request is
   * kept, since its connection may still be open. Otherwise every window restarts and any
   * request is dropped.
   */
  wake?: boolean;
}
