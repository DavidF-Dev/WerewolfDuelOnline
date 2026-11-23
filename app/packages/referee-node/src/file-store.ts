import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { StoredRoomSnapshot } from '@wwd/referee-core';
import { JOIN_CODE_PATTERN } from '@wwd/referee-service';

export type StoredSnapshot = StoredRoomSnapshot;

/** Produces the snapshot to write when its turn comes, or `undefined` to write nothing. */
export type SnapshotSource = () => StoredSnapshot | undefined;

/** The writes waiting for one room: the newest unwritten source and the running drain. */
interface WriteQueue {
  pending: SnapshotSource | undefined;
  running: Promise<void> | undefined;
}

/** Ages, in milliseconds, past which leftover files are deleted. */
export interface StaleAges {
  temp: number;
  quarantined: number;
}

const SNAPSHOT_FILE = /^([0-9A-Z]{6})\.json$/;
const QUARANTINED_FILE = /^[0-9A-Z]{6}\.faulted\.json$/;
const TEMP_FILE = /^\.[0-9A-Z]{6}\.[0-9a-f-]+\.tmp$/;
// Snapshots hold seat tokens and PINs; the rename keeps the temporary file's mode.
const OWNER_ONLY = 0o600;

/** How many times a rename refused because its target is open is retried, and the first delay. */
const RENAME_RETRIES = 6;
const RENAME_RETRY_MS = 10;
const TARGET_BUSY: ReadonlySet<string> = new Set(['EPERM', 'EACCES', 'EBUSY']);

function isMissing(thrown: unknown): boolean {
  return (thrown as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

/**
 * Renames `from` over `to`, retrying with a doubling delay while the target is busy: Windows
 * refuses to replace a file that another handle, such as a reader or a virus scanner, has open.
 */
async function renameRetrying(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (thrown) {
      const code = (thrown as NodeJS.ErrnoException | null)?.code ?? '';
      if (attempt >= RENAME_RETRIES || !TARGET_BUSY.has(code)) throw thrown;
      await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_MS * 2 ** attempt));
    }
  }
}

/**
 * Room snapshots kept as one JSON file per join code. Writes are atomic (a temporary file in
 * the same directory, then a rename) and serialised per room; a write scheduled while an earlier
 * one is under way replaces any other still waiting, and its snapshot is taken only when written.
 */
export class FileStore {
  private readonly queues = new Map<string, WriteQueue>();

  constructor(
    private readonly dir: string,
    private readonly onWriteError: (code: string, thrown: unknown) => void,
  ) {}

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  /** Whether the code is in use by a snapshot file, including a quarantined one. */
  async exists(code: string): Promise<boolean> {
    for (const path of [this.path(code), this.quarantinePath(code)]) {
      try {
        await stat(path);
        return true;
      } catch (thrown) {
        if (!isMissing(thrown)) throw thrown;
      }
    }
    return false;
  }

  /** Reads a room's snapshot, or `undefined` if it has none; throws if the file is unreadable. */
  async read(code: string): Promise<StoredSnapshot | undefined> {
    let text: string;
    try {
      text = await readFile(this.path(code), 'utf8');
    } catch (thrown) {
      if (isMissing(thrown)) return undefined;
      throw thrown;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // The parser's own message quotes the file, which may hold seat tokens and PINs.
      throw new Error('invalid JSON');
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { code?: unknown }).code !== code
    ) {
      throw new Error('snapshot does not belong to its room');
    }
    return parsed as StoredSnapshot;
  }

  /** When a room's snapshot file was last written, in epoch milliseconds. */
  async modifiedAt(code: string): Promise<number> {
    return (await stat(this.path(code))).mtimeMs;
  }

  /** Writes a snapshot now, after any write already under way for the room. */
  async write(code: string, snapshot: StoredSnapshot): Promise<void> {
    await this.settled(code);
    await this.writeAtomically(code, snapshot);
  }

  /** Queues a write; failures go to the write-error callback. */
  schedule(code: string, source: SnapshotSource): void {
    let queue = this.queues.get(code);
    if (queue === undefined) {
      queue = { pending: undefined, running: undefined };
      this.queues.set(code, queue);
    }
    queue.pending = source;
    queue.running ??= this.drain(code, queue);
  }

  /** Resolves once no write for the room is waiting or under way. */
  async settled(code: string): Promise<void> {
    for (let queue = this.queues.get(code); queue?.running; queue = this.queues.get(code)) {
      await queue.running;
    }
  }

  /** Deletes a room's snapshot, dropping any write still waiting for it. */
  async remove(code: string): Promise<void> {
    const queue = this.queues.get(code);
    if (queue !== undefined) queue.pending = undefined;
    await this.settled(code);
    await rm(this.path(code), { force: true });
  }

  /** Moves a room's snapshot aside so that it is no longer loaded, keeping its code in use. */
  async quarantine(code: string): Promise<void> {
    const queue = this.queues.get(code);
    if (queue !== undefined) queue.pending = undefined;
    await this.settled(code);
    try {
      await rename(this.path(code), this.quarantinePath(code));
    } catch (thrown) {
      if (!isMissing(thrown)) throw thrown;
    }
  }

  /** The join codes of every room with a snapshot file. */
  async codes(): Promise<string[]> {
    const codes: string[] = [];
    for (const name of await readdir(this.dir)) {
      const code = SNAPSHOT_FILE.exec(name)?.[1];
      if (code !== undefined && JOIN_CODE_PATTERN.test(code)) codes.push(code);
    }
    return codes;
  }

  /** Deletes orphaned temporary files and quarantined snapshots older than `ages`; returns how many. */
  async removeStale(now: number, ages: StaleAges): Promise<number> {
    let removed = 0;
    for (const name of await readdir(this.dir)) {
      const maxAge = TEMP_FILE.test(name)
        ? ages.temp
        : QUARANTINED_FILE.test(name)
          ? ages.quarantined
          : undefined;
      if (maxAge === undefined) continue;
      const path = join(this.dir, name);
      try {
        if (now - (await stat(path)).mtimeMs < maxAge) continue;
        await rm(path, { force: true });
        removed += 1;
      } catch (thrown) {
        if (!isMissing(thrown)) throw thrown;
      }
    }
    return removed;
  }

  /** Resolves once every scheduled write has finished. */
  async flush(): Promise<void> {
    while (this.queues.size > 0) {
      await Promise.all([...this.queues.values()].map((q) => q.running));
    }
  }

  private async drain(code: string, queue: WriteQueue): Promise<void> {
    // Yields once so writes scheduled in the same turn collapse into one.
    await Promise.resolve();
    while (queue.pending !== undefined) {
      const source = queue.pending;
      queue.pending = undefined;
      try {
        const snapshot = source();
        if (snapshot !== undefined) await this.writeAtomically(code, snapshot);
      } catch (thrown) {
        this.onWriteError(code, thrown);
      }
    }
    queue.running = undefined;
    if (this.queues.get(code) === queue) this.queues.delete(code);
  }

  private async writeAtomically(code: string, snapshot: StoredSnapshot): Promise<void> {
    const temp = join(this.dir, `.${code}.${randomUUID()}.tmp`);
    try {
      await writeFile(temp, JSON.stringify(snapshot), { mode: OWNER_ONLY });
      await renameRetrying(temp, this.path(code));
    } catch (thrown) {
      await rm(temp, { force: true });
      throw thrown;
    }
  }

  private path(code: string): string {
    return join(this.dir, `${code}.json`);
  }

  private quarantinePath(code: string): string {
    return join(this.dir, `${code}.faulted.json`);
  }
}
