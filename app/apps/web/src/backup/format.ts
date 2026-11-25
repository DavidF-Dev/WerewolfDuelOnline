import { contentHash } from '@wwd/engine';
import { canonicalJson } from '@wwd/protocol';
import { normaliseCode } from '../code.js';
import { parseServer } from '../online.js';
import { DEFAULT_SETTINGS, type Settings } from '../settings/settings.js';
import type { HistoryRecord, Identity, SessionRecord } from '../storage/db.js';
import { sessionId } from '../storage/sessions.js';

export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_COMPRESSED_BYTES = 5 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export interface BackupFile {
  format_version: typeof BACKUP_FORMAT_VERSION;
  exported_at: number;
  settings: Settings;
  identity: Identity;
  sessions: SessionRecord[];
  history: HistoryRecord[];
  /** The content hash of the canonical JSON of every other field. */
  checksum: string;
}

export type BackupErrorReason = 'corrupt' | 'checksum' | 'version';

/** Why a file could not be read as a backup. */
export class BackupError extends Error {
  readonly reason: BackupErrorReason;

  constructor(reason: BackupErrorReason) {
    super(`backup refused: ${reason}`);
    this.name = 'BackupError';
    this.reason = reason;
  }
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** The name for a backup made on the local date of `date`. */
export const backupFileName = (date: Date): string =>
  `werewolf-duel-backup-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}.wwdb`;

export const backupChecksum = (body: Omit<BackupFile, 'checksum'>): string =>
  contentHash(canonicalJson(body));

async function drain(
  stream: CompressionStream | DecompressionStream,
  input: Uint8Array,
  limit: number = Infinity,
): Promise<Uint8Array<ArrayBuffer>> {
  const writer = stream.writable.getWriter();
  // A failure to write surfaces again from the reader below.
  void writer
    .write(input as Uint8Array<ArrayBuffer>)
    .then(() => writer.close())
    .catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
    length += value.length;
    if (length > limit) {
      await reader.cancel().catch(() => undefined);
      throw new BackupError('corrupt');
    }
  }
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export const gzipText = (text: string): Promise<Uint8Array<ArrayBuffer>> =>
  drain(new CompressionStream('gzip'), new TextEncoder().encode(text));

function bytesOf(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** The text inside a gzip blob; rejects when the data is not valid gzip. */
export async function gunzipText(blob: Blob): Promise<string> {
  if (blob.size > MAX_BACKUP_COMPRESSED_BYTES) throw new BackupError('corrupt');
  const bytes = await drain(new DecompressionStream('gzip'), await bytesOf(blob), MAX_BACKUP_BYTES);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isSeat = (value: unknown): boolean => value === 'p0' || value === 'p1';
const optional = (value: unknown, check: (v: unknown) => boolean): boolean =>
  value === undefined || check(value);
const isJoinCode = (value: unknown): boolean => isString(value) && normaliseCode(value) === value;

function validSettings(value: unknown): value is Settings {
  if (!isObject(value)) return false;
  return Object.entries(DEFAULT_SETTINGS).every(([key, fallback]) => {
    const stored = value[key];
    if (stored === undefined) return true;
    return key === 'server'
      ? stored === null || isString(stored)
      : typeof stored === typeof fallback;
  });
}

function validIdentity(value: unknown): value is Identity {
  return isObject(value) && isString(value['deviceId']) && optional(value['displayName'], isString);
}

function validSession(value: unknown): value is SessionRecord {
  return (
    isObject(value) &&
    isString(value['id']) &&
    isString(value['server']) &&
    isString(value['room']) &&
    isString(value['seatToken']) &&
    optional(value['seat'], isSeat) &&
    isNumber(value['lastSeq']) &&
    isNumber(value['game']) &&
    (value['status'] === 'active' ||
      value['status'] === 'paused' ||
      value['status'] === 'finished') &&
    optional(value['save'], isObject) &&
    optional(value['resumedAs'], isString) &&
    optional(value['opponentName'], isString) &&
    optional(value['finishedAt'], isNumber) &&
    optional(value['round'], isNumber) &&
    optional(value['yourTurn'], isBoolean) &&
    isNumber(value['savedAt'])
  );
}

function validHistory(value: unknown): value is HistoryRecord {
  return (
    isObject(value) &&
    isString(value['id']) &&
    isNumber(value['finishedAt']) &&
    isSeat(value['seat']) &&
    optional(value['opponentName'], isString) &&
    isObject(value['config']) &&
    isObject(value['replay']) &&
    isSeat(value['winner']) &&
    isString(value['reason']) &&
    isNumber(value['rounds'])
  );
}

/** Checks `text` is a backup of this format whose contents match its checksum. */
export function parseBackup(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('corrupt');
  }
  if (!isObject(parsed) || !isNumber(parsed['format_version'])) throw new BackupError('corrupt');
  if (parsed['format_version'] !== BACKUP_FORMAT_VERSION) throw new BackupError('version');
  const { checksum, ...body } = parsed;
  if (!isString(checksum)) throw new BackupError('corrupt');
  if (contentHash(canonicalJson(body)) !== checksum) throw new BackupError('checksum');
  const { sessions, history, exported_at: exportedAt, settings, identity } = body;
  if (
    !isNumber(exportedAt) ||
    !validSettings(settings) ||
    !validIdentity(identity) ||
    !Array.isArray(sessions) ||
    !sessions.every(validSession) ||
    !Array.isArray(history) ||
    !history.every(validHistory)
  ) {
    throw new BackupError('corrupt');
  }
  const kept = sessions.filter(
    (session) =>
      isJoinCode(session.room) &&
      optional(session.resumedAs, isJoinCode) &&
      session.id === sessionId(session.server, session.room) &&
      parseServer(session.server) !== undefined,
  );
  const backup: BackupFile = {
    format_version: BACKUP_FORMAT_VERSION,
    exported_at: exportedAt,
    settings,
    identity,
    sessions: kept,
    history,
    checksum,
  };
  skipped.set(backup, sessions.length - kept.length);
  return backup;
}

const skipped = new WeakMap<BackupFile, number>();

/** How many sessions in the file were dropped for an id, room or server that does not hold up. */
export const skippedSessions = (backup: BackupFile): number => skipped.get(backup) ?? 0;
