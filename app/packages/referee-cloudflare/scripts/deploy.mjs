#!/usr/bin/env node
// Runs `wrangler deploy --env <env>` only with a usable, wildcard-free ALLOWED_ORIGINS list.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const USAGE =
  'Usage: node scripts/deploy.mjs <staging|production> --var ALLOWED_ORIGINS:<origins> ' +
  '[other wrangler deploy options]';
const HTTPS_ORIGIN = /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/;
const LOCALHOST_ORIGIN = /^http:\/\/localhost(:\d+)?$/;

function fail(message) {
  process.stderr.write(`${message}\n${USAGE}\n`);
  process.exit(2);
}

/** The `KEY:value` pairs given with `--var`, which takes one or more pairs or `--var=KEY:value`. */
function vars(args) {
  const pairs = new Map();
  const add = (pair) => {
    const colon = pair.indexOf(':');
    if (colon > 0) pairs.set(pair.slice(0, colon), pair.slice(colon + 1));
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--var=')) add(arg.slice('--var='.length));
    else if (arg === '--var') {
      while (i + 1 < args.length && !args[i + 1].startsWith('-')) add(args[++i]);
    }
  }
  return pairs;
}

const [env, ...rest] = process.argv.slice(2);
if (env !== 'staging' && env !== 'production') fail('Expected the environment to deploy.');

// These would pick another environment, worker or config than the one this guard checked.
const FIXED_OPTION = /^(--(env|name|config)|-[ce])(=|$)/;
const fixed = rest.find((arg) => FIXED_OPTION.test(arg));
if (fixed !== undefined) fail(`The option ${fixed.split('=')[0]} is not allowed here.`);

const given = vars(rest);
const origins = (given.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin !== '');
if (origins.length === 0) {
  fail(
    'No allowed origins given, so no browser could use this referee. Pass ' +
      '--var ALLOWED_ORIGINS:https://<app-origin>[,https://<another>].',
  );
}
for (const origin of origins) {
  const allowed = HTTPS_ORIGIN.test(origin) || (env === 'staging' && LOCALHOST_ORIGIN.test(origin));
  if (!allowed) fail(`Not an allowed origin: ${origin}`);
}
if (given.has('TEST_OVERRIDES')) fail('Never set TEST_OVERRIDES: deploys keep test overrides off.');

/** The installed wrangler's command-line script. */
function installedWrangler() {
  const manifest = createRequire(import.meta.url).resolve('wrangler/package.json');
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8'));
  return join(dirname(manifest), typeof bin === 'string' ? bin : bin.wrangler);
}

// WWD_WRANGLER_BIN names a Node script run in wrangler's place, so this guard's tests never deploy.
const wrangler = process.env.WWD_WRANGLER_BIN || installedWrangler();
const result = spawnSync(
  process.execPath,
  [wrangler, 'deploy', '--env', env, ...rest, '--var', `ALLOWED_ORIGINS:${origins.join(',')}`],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
