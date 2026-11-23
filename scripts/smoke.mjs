#!/usr/bin/env node
// A post-deploy smoke test for a Werewolf: Duel! Online referee, using only Node built-ins.
// It makes four to seven requests: up to four health checks, one room creation and two WebSocket
// upgrades. One player then resigns over its socket, so the room is kept only as long as a
// finished one.
import { parseArgs } from 'node:util';

const USAGE = 'Usage: node scripts/smoke.mjs <referee-url> [--timeout <ms>] [--retry-delay <ms>]';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 3_000;
const HEALTH_ATTEMPTS = 4;
const CLOSE_WAIT_MS = 2_000;
const ROOM_REQUEST = {
  config: { tiebreak: 'hourglasses_then_badge', min_targets: 1, badge_start: 'random' },
  grace_minutes: 10,
};

function usage(message) {
  process.stderr.write(`${message}\n${USAGE}\n`);
  process.exit(2);
}

/** Reads the referee base URL and the time limit from the command line. */
function readArgs() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        timeout: { type: 'string', default: String(DEFAULT_TIMEOUT_MS) },
        'retry-delay': { type: 'string', default: String(DEFAULT_RETRY_DELAY_MS) },
      },
    });
  } catch (thrown) {
    usage(thrown instanceof Error ? thrown.message : String(thrown));
  }
  const [raw] = parsed.positionals;
  if (raw === undefined || parsed.positionals.length > 1) usage('Expected one referee URL.');
  let base;
  try {
    base = new URL(raw);
  } catch {
    usage(`Not a URL: ${raw}`);
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    usage(`Not an http or https URL: ${raw}`);
  }
  const milliseconds = (name) => {
    const value = Number(parsed.values[name]);
    if (!Number.isInteger(value) || value <= 0) {
      usage(`--${name} is not a positive whole number of milliseconds: ${parsed.values[name]}`);
    }
    return value;
  };
  return {
    base: base.href.replace(/\/+$/, ''),
    timeoutMs: milliseconds('timeout'),
    retryDelayMs: milliseconds('retry-delay'),
  };
}

/** Reads a response body as JSON, or returns its text when it is not JSON. */
async function body(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** One WebSocket client that records what the referee sends it. */
class Player {
  constructor(label, url, signal) {
    this.signal = signal;
    this.label = label;
    this.messages = [];
    this.opened = false;
    this.closeCode = undefined;
    this.checks = new Set();
    this.socket = new WebSocket(url);
    this.socket.addEventListener('open', () => {
      this.opened = true;
      this.notify();
    });
    this.socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        message = { type: 'unreadable', data: String(event.data) };
      }
      this.messages.push(message);
      this.notify();
    });
    this.socket.addEventListener('close', (event) => {
      this.closeCode = event.code;
      this.notify();
    });
    signal.addEventListener('abort', () => this.notify());
  }

  notify() {
    for (const check of this.checks) check();
  }

  /** The first message of `type` received so far, if any. */
  first(type) {
    return this.messages.find((message) => message.type === type);
  }

  /** Resolves once `done()` holds; rejects if the referee sends an error or the socket closes. */
  until(done) {
    return new Promise((resolve, reject) => {
      const check = () => {
        const error = this.first('error') ?? this.first('unreadable');
        if (done()) {
          this.checks.delete(check);
          resolve();
        } else if (this.signal.aborted) {
          this.checks.delete(check);
          reject(this.signal.reason);
        } else if (error !== undefined) {
          this.checks.delete(check);
          reject(new Error(`${this.label} was sent ${JSON.stringify(error)}`));
        } else if (this.closeCode !== undefined) {
          this.checks.delete(check);
          reject(new Error(`${this.label}'s connection closed with code ${this.closeCode}`));
        }
      };
      this.checks.add(check);
      check();
    });
  }

  async hello(protocolVersion, room) {
    await this.until(() => this.opened);
    this.socket.send(JSON.stringify({ type: 'hello', protocol_version: protocolVersion, room }));
    await this.until(() => this.first('welcome') !== undefined);
  }

  /** Closes the socket and resolves once it has closed. */
  close() {
    if (this.closeCode !== undefined) return Promise.resolve();
    const closed = new Promise((resolve) => this.socket.addEventListener('close', resolve));
    this.socket.close(1000);
    return closed;
  }
}

const { base, timeoutMs, retryDelayMs } = readArgs();
const players = [];
const controller = new AbortController();
const { signal } = controller;
let step = 'starting';

function passed(line) {
  process.stdout.write(`ok   ${line}\n`);
}

/** Fetches `/health` once and returns its body, or throws if it is not healthy. */
async function healthOnce() {
  const response = await fetch(`${base}/health`, { signal });
  const health = await body(response);
  if (response.status !== 200 || health?.ok !== true) {
    throw new Error(`expected 200 {ok: true}, got ${response.status} ${JSON.stringify(health)}`);
  }
  if (!Number.isInteger(health.protocol_version)) {
    throw new Error(`no protocol_version in ${JSON.stringify(health)}`);
  }
  return health;
}

/** Checks `/health`, retrying a few times so that a referee deployed moments ago can come up. */
async function checkHealth() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await healthOnce();
    } catch (thrown) {
      if (signal.aborted) throw signal.reason;
      if (attempt === HEALTH_ATTEMPTS) {
        const reason = thrown instanceof Error ? thrown.message : String(thrown);
        throw new Error(`${reason} after ${HEALTH_ATTEMPTS} attempts`, { cause: thrown?.cause });
      }
      process.stdout.write(`...  health check failed, retrying in ${retryDelayMs} ms\n`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

async function run() {
  if (typeof WebSocket !== 'function') throw new Error('this Node has no global WebSocket');

  step = 'checking /health';
  const health = await checkHealth();
  passed(`health: protocol ${health.protocol_version}, engine ${health.engine_version}`);

  step = 'creating a room';
  const roomResponse = await fetch(`${base}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ROOM_REQUEST),
    signal,
  });
  const created = await body(roomResponse);
  if (roomResponse.status !== 201 || typeof created?.code !== 'string') {
    throw new Error(`expected 201 {code}, got ${roomResponse.status} ${JSON.stringify(created)}`);
  }
  const room = created.code;
  passed(`room created: ${room}`);

  const socketUrl = new URL(`${base}/rooms/${room}/ws`);
  socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';

  step = 'joining the first player';
  const first = new Player('the first player', socketUrl.href, signal);
  players.push(first);
  await first.hello(health.protocol_version, room);
  passed(`first player welcomed as ${first.first('welcome').seat}`);

  step = 'joining the second player';
  const second = new Player('the second player', socketUrl.href, signal);
  players.push(second);
  await second.hello(health.protocol_version, room);
  passed(`second player welcomed as ${second.first('welcome').seat}`);
  if (first.first('welcome').seat === second.first('welcome').seat) {
    throw new Error('both players were given the same seat');
  }

  step = 'waiting for the game to start';
  await Promise.all(players.map((p) => p.until(() => p.first('events') !== undefined)));
  passed('both players were sent the opening events');

  // A finished room is kept for a day rather than the month an unfinished one is.
  step = 'resigning to finish the room';
  if (isOver(latestView(first))) return;
  first.socket.send(JSON.stringify({ type: 'command', cmd: 'resign' }));
  await Promise.all(players.map((p) => p.until(() => p.first('game_over') !== undefined)));
  passed('the first player resigned, so the room is finished');
}

/** The view in the most recent events `player` was sent. */
function latestView(player) {
  return player.messages.findLast((message) => message.type === 'events')?.view;
}

/** Whether a view shows the game over, when a resignation is no longer legal. */
function isOver(view) {
  return typeof view?.phase === 'object' && view.phase !== null && 'game_over' in view.phase;
}

const timer = setTimeout(() => {
  controller.abort(new Error(`timed out after ${timeoutMs} ms`));
}, timeoutMs);

try {
  await run();
  process.stdout.write(`Smoke test passed for ${base}\n`);
} catch (thrown) {
  const reason = thrown instanceof Error ? thrown.message : String(thrown);
  const cause =
    thrown instanceof Error && thrown.cause instanceof Error ? ` (${thrown.cause.message})` : '';
  process.stderr.write(`Smoke test failed for ${base} while ${step}: ${reason}${cause}\n`);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  // Exiting with sockets still closing can abort Node on Windows, so the event loop drains instead.
  let closeTimer;
  const closed = await Promise.race([
    Promise.all(players.map((player) => player.close())).then(() => true),
    new Promise((resolve) => {
      closeTimer = setTimeout(() => resolve(false), CLOSE_WAIT_MS);
    }),
  ]);
  clearTimeout(closeTimer);
  if (!closed) process.exit();
}
