import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startReferee } from '@wwd/referee-node';
import { PORTS } from './ports.js';

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
    logger: { info: () => {}, warn: console.warn, error: console.error },
  });
  return async () => {
    await referee.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
  };
}
