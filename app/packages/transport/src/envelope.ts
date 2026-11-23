/** Name of the channel used by local (same-browser) play. */
export const LOCAL_CHANNEL = 'wwd-local';

export type EnvelopeDir = 'c2s' | 's2c' | 'close';

/** The shape of every message posted on a local channel. */
export interface Envelope {
  conn: string;
  dir: EnvelopeDir;
  text?: string;
}

/** Validates untrusted channel data; returns undefined unless it is a well-formed envelope. */
export function parseEnvelope(data: unknown): Envelope | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const { conn, dir, text } = data as Record<string, unknown>;
  if (typeof conn !== 'string' || conn.length === 0) return undefined;
  if (dir !== 'c2s' && dir !== 's2c' && dir !== 'close') return undefined;
  if (text !== undefined && typeof text !== 'string') return undefined;
  return text === undefined ? { conn, dir } : { conn, dir, text };
}
