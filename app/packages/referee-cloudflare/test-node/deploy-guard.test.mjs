import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const PACKAGE = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(PACKAGE, 'scripts', 'deploy.mjs');
const STUB = fileURLToPath(new URL('wrangler-stub.mjs', import.meta.url));
const STUB_MARKER = /^WRANGLER_STUB_ARGV (.*)$/m;
const ORIGINS = 'ALLOWED_ORIGINS:https://u.github.io';
// Wrangler finds credentials in these variables, or in config under these directories.
const CREDENTIAL_VARIABLE = /^(CLOUDFLARE_|CF_)/i;
const CONFIG_DIRECTORIES = ['XDG_CONFIG_HOME', 'APPDATA', 'LOCALAPPDATA', 'HOME', 'USERPROFILE'];

const dirs = [];

async function tempDir(prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

/**
 * An environment in which wrangler cannot authenticate even if the machine's owner is logged
 * in: no Cloudflare credential variables, and every config directory an empty temporary one.
 */
async function sandboxEnv() {
  const home = await tempDir('wwd-deploy-guard-home-');
  const replaced = new Set([...CONFIG_DIRECTORIES, 'WWD_WRANGLER_BIN', 'WRANGLER_SEND_METRICS']);
  const env = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (CREDENTIAL_VARIABLE.test(name) || replaced.has(name.toUpperCase())) continue;
    env[name] = value;
  }
  for (const name of CONFIG_DIRECTORIES) env[name] = home;
  env.WRANGLER_SEND_METRICS = 'false';
  return env;
}

/**
 * Runs the deploy guard with `args` against the wrangler stub, or against the real wrangler when
 * `real` is set, which is allowed only with `--dry-run`. Resolves with the exit code, the output
 * and, when the stub ran, the arguments the guard handed to wrangler.
 */
async function deploy({ real = false } = {}, ...args) {
  if (real && !args.includes('--dry-run')) {
    throw new Error('the real wrangler may only be run with --dry-run');
  }
  const env = await sandboxEnv();
  if (!real) env.WWD_WRANGLER_BIN = STUB;
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [SCRIPT, ...args],
      { cwd: PACKAGE, timeout: 120_000, env },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : -1;
        const argv = STUB_MARKER.exec(stdout)?.[1];
        resolve({ code, stdout, stderr, wrangler: argv === undefined ? null : JSON.parse(argv) });
      },
    );
  });
}

const stubbed = (...args) => deploy({}, ...args);

/** Checks that the guard refused with exit code 2 and never started wrangler. */
function expectRefused(run, message, label) {
  expect(run.code, label).toBe(2);
  expect(run.wrangler, label).toBeNull();
  expect(run.stderr, label).toMatch(message);
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('deploy guard', () => {
  it('needs an environment', async () => {
    expectRefused(await stubbed(), /usage: node scripts\/deploy\.mjs <staging\|production>/i);
  });

  it('refuses to deploy without allowed origins', async () => {
    expectRefused(await stubbed('staging'), /no allowed origins/i);
  });

  it('refuses an empty origin list', async () => {
    expectRefused(
      await stubbed('production', '--var', 'ALLOWED_ORIGINS: , '),
      /no allowed origins/i,
    );
  });

  it('refuses a wildcard origin', async () => {
    expectRefused(
      await stubbed('production', '--var', 'ALLOWED_ORIGINS:*'),
      /not an allowed origin: \*/i,
    );
  });

  it('refuses a plain http origin in production', async () => {
    expectRefused(
      await stubbed('production', '--var=ALLOWED_ORIGINS:http://localhost:5173'),
      /not an allowed origin: http:\/\/localhost:5173/i,
    );
  });

  it('refuses to forward TEST_OVERRIDES in any form, even switched off', async () => {
    for (const args of [
      ['--var', 'TEST_OVERRIDES:1'],
      ['--var', 'TEST_OVERRIDES:0'],
      ['--var=TEST_OVERRIDES:0'],
      ['--var', 'X:1', 'TEST_OVERRIDES:1'],
    ]) {
      const run = await stubbed('staging', '--var', ORIGINS, ...args);
      expectRefused(run, /test overrides/i, args.join(' '));
    }
  });

  it('refuses options that would change which worker or config is deployed', async () => {
    for (const args of [
      ['--env', 'production'],
      ['--env=production'],
      ['-e', 'production'],
      ['-e=production'],
      ['--name', 'other'],
      ['--name=other'],
      ['--config', 'other.toml'],
      ['--config=other.toml'],
      ['-c', 'other.toml'],
      ['-c=other.toml'],
    ]) {
      const run = await stubbed('staging', '--var', ORIGINS, ...args);
      expectRefused(run, /not allowed here/i, args.join(' '));
    }
  });

  it('hands wrangler the environment, the other options and the checked origins', async () => {
    const run = await stubbed(
      'staging',
      '--var',
      'ALLOWED_ORIGINS: https://u.github.io , http://localhost:5173',
      '--minify',
    );
    expect(run.stderr).toBe('');
    expect(run.code).toBe(0);
    expect(run.wrangler).toEqual([
      'deploy',
      '--env',
      'staging',
      '--var',
      'ALLOWED_ORIGINS: https://u.github.io , http://localhost:5173',
      '--minify',
      '--var',
      'ALLOWED_ORIGINS:https://u.github.io,http://localhost:5173',
    ]);
  });

  it('hands a production deploy its own environment', async () => {
    const run = await stubbed('production', `--var=${ORIGINS}`);
    expect(run.code).toBe(0);
    expect(run.wrangler).toEqual([
      'deploy',
      '--env',
      'production',
      `--var=${ORIGINS}`,
      '--var',
      ORIGINS,
    ]);
  });

  it('the test helper never runs the real wrangler without --dry-run', async () => {
    await expect(deploy({ real: true }, 'staging', '--var', ORIGINS)).rejects.toThrow(
      /only be run with --dry-run/,
    );
  });

  it('a dry run through the real wrangler bundles the worker', async () => {
    const outdir = await tempDir('wwd-deploy-guard-out-');

    const run = await deploy(
      { real: true },
      'staging',
      '--var',
      'ALLOWED_ORIGINS:https://u.github.io,http://localhost:5173',
      '--dry-run',
      '--outdir',
      outdir,
    );

    expect(run.code).toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/--dry-run: exiting now/);
    expect(await readdir(outdir)).toContain('worker.js');
  }, 120_000);
});
