import { EngineFault, Game, verifyReplay, type Replay } from '@wwd/engine';
import {
  MAX_SAVE_SEGMENTS,
  SAVE_FORMAT_VERSION,
  canonicalJson,
  saveHash,
  type SaveFile,
} from '@wwd/protocol';

/** Thrown for a save file that a room cannot be created from. */
export class InvalidSaveError extends Error {
  constructor(reason: string) {
    super(`invalid save: ${reason}`);
    this.name = 'InvalidSaveError';
  }
}

/** A verified save's game, stopped at the save's boundary. */
export interface VerifiedSave {
  game: Game;
  /** The game-wide sequence number of the first event of the game's last segment. */
  segmentBase: number;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function sameJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/**
 * Checks a save from an untrusted upload: its format, its hash, that its replay verifies and is
 * untainted, and that the replay ends at exactly the save's boundary under the save's config.
 * Throws `InvalidSaveError` for any failure other than an engine fault.
 */
export function verifySave(save: SaveFile): VerifiedSave {
  const fields: unknown = save;
  if (!isRecord(fields) || fields['kind'] !== 'wwd-save') {
    throw new InvalidSaveError('not a save file');
  }
  if (fields['format_version'] !== SAVE_FORMAT_VERSION) {
    throw new InvalidSaveError('unsupported format version');
  }
  const savedAt = fields['saved_at'];
  if (
    typeof fields['hash'] !== 'string' ||
    typeof fields['room'] !== 'string' ||
    typeof savedAt !== 'number' ||
    !Number.isSafeInteger(savedAt) ||
    savedAt < 0
  ) {
    throw new InvalidSaveError('malformed fields');
  }
  const replay: unknown = save.replay;
  // Checked before any engine work, which grows with the square of the segment count.
  if (!isRecord(replay) || !Array.isArray(replay['segments'])) {
    throw new InvalidSaveError('malformed replay');
  }
  if (replay['segments'].length > MAX_SAVE_SEGMENTS) {
    throw new InvalidSaveError('too many segments');
  }
  if (saveHash(save) !== save.hash) throw new InvalidSaveError('hash mismatch');
  if (replay['tainted'] !== false) {
    throw new InvalidSaveError('tainted replay');
  }
  if (!sameJson(replay['config'], save.config)) throw new InvalidSaveError('config mismatch');
  return engineChecked(() => {
    verifyReplay(save.replay);
    const game = Game.fromReplay(save.replay);
    try {
      const boundary = game.roundBoundary();
      if (boundary === null || !sameJson(boundary, save.boundary)) {
        throw new InvalidSaveError('boundary mismatch');
      }
      return { game, segmentBase: segmentBaseOf(save.replay) };
    } catch (thrown) {
      game.dispose();
      throw thrown;
    }
  });
}

/** Runs engine checks on untrusted data, turning any rejection into `InvalidSaveError`. */
function engineChecked<T>(check: () => T): T {
  try {
    return check();
  } catch (thrown) {
    if (thrown instanceof InvalidSaveError || thrown instanceof EngineFault) throw thrown;
    throw new InvalidSaveError('replay does not verify');
  }
}

/** The total event log length of every segment but the last of a verified replay. */
function segmentBaseOf(replay: Replay): number {
  let base = 0;
  for (let k = 1; k < replay.segments.length; k++) {
    const prefix = Game.fromReplay({ ...replay, segments: replay.segments.slice(0, k) });
    try {
      base += prefix.logLength();
    } finally {
      prefix.dispose();
    }
  }
  return base;
}
