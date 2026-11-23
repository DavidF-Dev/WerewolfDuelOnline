#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { startReferee } from './server.js';

const USAGE =
  'Usage: wwd-referee --port 8787 --host 0.0.0.0 --data ./data --origins <list> ' +
  '[--test-overrides] [--trust-proxy]';

function fail(message: string): never {
  process.stderr.write(`${message}\n${USAGE}\n`);
  process.exit(2);
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      port: { type: 'string', default: '8787' },
      host: { type: 'string', default: '0.0.0.0' },
      data: { type: 'string', default: './data' },
      origins: { type: 'string', default: '' },
      'test-overrides': { type: 'boolean', default: false },
      'trust-proxy': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  }));
} catch (thrown) {
  fail(thrown instanceof Error ? thrown.message : String(thrown));
}

if (values.help) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

const port = Number(values.port);
if (!Number.isInteger(port) || port < 0 || port > 65_535) fail(`Invalid port: ${values.port}`);

const allowedOrigins = values.origins
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);
if (allowedOrigins.length === 0) {
  process.stderr.write('Warning: no --origins given, so browsers cannot call this referee.\n');
}

const referee = await startReferee({
  port,
  host: values.host,
  dataDir: values.data,
  allowedOrigins,
  testOverrides: values['test-overrides'],
  trustProxy: values['trust-proxy'],
  // Logs go to stderr so that stdout carries only the listening URL.
  logger: { info: console.error, warn: console.error, error: console.error },
});
// A wildcard bind address is not one a client can connect to.
const url = new URL(referee.url);
if (url.hostname === '0.0.0.0' || url.hostname === '[::]') url.hostname = 'localhost';
process.stdout.write(`${url.origin}\n`);

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  referee.close().then(
    () => process.exit(0),
    (thrown: unknown) => {
      process.stderr.write(`${String(thrown)}\n`);
      process.exit(1);
    },
  );
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
