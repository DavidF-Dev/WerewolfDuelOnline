import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startReferee } from '@wwd/referee-node';
import { PORTS } from './ports.js';

/** Where the referee keeps its rooms, set for the test workers once it has started. */
export const DATA_DIR_ENV = 'WWD_E2E_REFEREE_DATA';
/** How long a room with no connections stays in memory, so a test can see it unloaded. */
export const E2E_IDLE_UNLOAD_MS = 1_000;
// One run creates more rooms than the production limit of 20 per address per hour.
const E2E_ROOM_CREATE_LIMIT = 100;

/**
 * Starts a Node referee with test overrides in the test runner's own process, keeping its rooms
 * in a fresh temporary directory; the returned teardown stops it and removes the directory.
 */
export default async function startNodeReferee(): Promise<() => Promise<void>> {
  const dataDir = await mkdtemp(join(tmpdir(), 'wwd-e2e-referee-'));
  const referee = await startReferee({
    port: PORTS.onlineReferee,
    host: '127.0.0.1',
    dataDir,
    allowedOrigins: [],
    testOverrides: true,
    idleUnloadMs: E2E_IDLE_UNLOAD_MS,
    roomCreateLimit: E2E_ROOM_CREATE_LIMIT,
    logger: { info: () => {}, warn: console.warn, error: console.error },
  });
  process.env[DATA_DIR_ENV] = dataDir;
  return async () => {
    await referee.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
  };
}
