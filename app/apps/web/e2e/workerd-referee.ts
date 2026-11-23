import { rmdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { unstable_dev } from 'wrangler';
import { PORTS } from './ports.js';

/** Removes `dir` only if it is empty, and then its parent `levels` times over likewise. */
async function removeIfEmpty(dir: string, levels: number): Promise<void> {
  try {
    await rmdir(dir);
  } catch {
    return;
  }
  if (levels > 0) await removeIfEmpty(dirname(dir), levels - 1);
}

/**
 * Starts the Cloudflare referee under `wrangler dev` in local mode (workerd, no account), with
 * test overrides and nothing persisted; the returned teardown stops it and removes the empty
 * scratch folder wrangler leaves in the working directory.
 */
export default async function startWorkerdReferee(): Promise<() => Promise<void>> {
  const root = dirname(
    createRequire(import.meta.url).resolve('@wwd/referee-cloudflare/package.json'),
  );
  const worker = await unstable_dev(join(root, 'src', 'worker.ts'), {
    config: join(root, 'wrangler.toml'),
    ip: '127.0.0.1',
    port: PORTS.parityReferee,
    local: true,
    persist: false,
    vars: { TEST_OVERRIDES: '1' },
    logLevel: 'warn',
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
  });
  return async () => {
    await worker.stop();
    await removeIfEmpty(join(process.cwd(), '.wrangler', 'tmp'), 1);
  };
}
