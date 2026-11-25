// Writes three seeded games as markdown logs per view; `--search` finds seeds for the scenarios.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Game, defaultRulesConfig, replayTimeline } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import { createLocaliser } from '@wwd/client-core';

const OUT = new URL('../visual-output/transcripts/', import.meta.url);
const MAX_STEPS = 20_000;

/** What the games must show between them, and how to spot each in an event. */
const SCENARIOS = {
  'a Potion hit': (kind) => 'potion_resolved' in kind && kind.potion_resolved.hit,
  'a Hunter declining': (kind) => forfeited(kind, 'declined'),
  'a Wolf King short of Fangs': (kind) => forfeited(kind, 'cannot_pay_fangs'),
  'a forfeited attack': (kind) => forfeited(kind, 'no_cross') || forfeited(kind, 'no_targets'),
  'a resignation': (kind) => 'resigned' in kind,
  'a discard reveal': (kind) => 'discard_revealed' in kind,
};

/** Found with `--search`: each game's seed, and the round whose plan phase it resigns in. */
const GAMES = [
  { seed: 1015, resignIn: null },
  { seed: 111, resignIn: null },
  { seed: 1, resignIn: 3 },
];

const VIEWS = [
  { file: 'p0', title: 'as Player 1', viewer: { seat: 'p0' }, perspective: 'p0' },
  { file: 'p1', title: 'as Player 2', viewer: { seat: 'p1' }, perspective: 'p1' },
  { file: 'replay', title: 'as a replay', viewer: 'omniscient', perspective: null },
];

function forfeited(kind, reason) {
  return 'attack_forfeited' in kind && kind.attack_forfeited.reason === reason;
}

/** A deterministic xorshift generator for choosing among legal actions. */
class Xorshift {
  constructor(seed) {
    this.state = seed >>> 0 || 1;
  }

  pick(items) {
    this.state ^= this.state << 13;
    this.state ^= this.state >>> 17;
    this.state ^= this.state << 5;
    this.state >>>= 0;
    return items[this.state % items.length];
  }
}

const seedHex = (seed) => seed.toString(16).padStart(64, '0');

/** Plays a game with random legal actions, resigning in round `resignIn` if it gets there. */
function play({ seed, resignIn }) {
  const game = Game.create(seedHex(seed), defaultRulesConfig());
  const rng = new Xorshift(seed);
  for (let step = 0; step < MAX_STEPS; step++) {
    const pending = game.pending();
    if (pending.kind === 'none') return game;
    const seat = rng.pick(pending.seats);
    if (pending.kind === 'plan' && game.view('omniscient').round === resignIn) {
      game.apply(seat, 'resign');
      return game;
    }
    game.apply(seat, rng.pick(game.legalActions(seat)));
  }
  throw new Error(`game ${seed} did not finish`);
}

/** The scenarios a game shows, with the round each first happens in. */
function shown(game) {
  const found = new Map();
  let round = 0;
  for (const [, event] of game.eventsSince(0, 'omniscient')) {
    if ('round_started' in event.kind) round = event.kind.round_started.round;
    for (const [name, matches] of Object.entries(SCENARIOS)) {
      if (!found.has(name) && matches(event.kind)) found.set(name, round);
    }
  }
  return found;
}

/** Seeds for three short games that show every scenario between them. */
function search() {
  const wanted = Object.keys(SCENARIOS);
  const games = [];
  const covered = new Set();
  const plans = [
    { resignIn: null, needs: ['a Potion hit', 'a Hunter declining'] },
    { resignIn: null, needs: ['a Wolf King short of Fangs', 'a forfeited attack'] },
    { resignIn: 3, needs: ['a resignation'] },
  ];
  for (const plan of plans) {
    for (let seed = 1; ; seed++) {
      if (seed > 5_000) throw new Error(`no seed shows ${plan.needs.join(' and ')}`);
      if (games.some((g) => g.seed === seed)) continue;
      const game = play({ seed, resignIn: plan.resignIn });
      const found = shown(game);
      const rounds = game.view('omniscient').round;
      game.dispose();
      if (rounds <= 6 && plan.needs.every((name) => found.has(name))) {
        games.push({ seed, resignIn: plan.resignIn });
        for (const name of found.keys()) covered.add(name);
        break;
      }
    }
  }
  const missing = wanted.filter((name) => !covered.has(name));
  if (missing.length > 0) throw new Error(`the seeds found miss ${missing.join(', ')}`);
  return games;
}

const escapeMarkdown = (text) => text.replace(/[\\*_`#[\]]/g, (c) => `\\${c}`);

/** One log line as markdown: names in bold, and each marker as its word. */
function markdown(parts) {
  return parts
    .map((part) => {
      if ('text' in part) return escapeMarkdown(part.text);
      if ('player' in part) return `**${escapeMarkdown(part.player)}**`;
      if ('character' in part) return `**${escapeMarkdown(part.character)}**`;
      return escapeMarkdown(part.label);
    })
    .join('');
}

function transcript(l, game, number, view) {
  const events =
    view.viewer === 'omniscient'
      ? replayTimeline(game.replay(), 'omniscient').flatMap((step) => step.events)
      : game.eventsSince(0, view.viewer).map(([, event]) => event);
  const scenarios = [...shown(game)].map(([name, round]) => `${name} (round ${round})`);
  const lines = [
    `# Game ${number}, ${view.title}`,
    '',
    `Seed \`${seedHex(GAMES[number - 1].seed)}\`. Shows ${scenarios.join(', ')}.`,
    '',
  ];
  for (const event of events) {
    if ('round_started' in event.kind) {
      lines.push('', `## Round ${event.kind.round_started.round}`, '');
    }
    const parts =
      'game_started' in event.kind
        ? [{ text: l.t('log-game-started') }]
        : l.richEvent(event, view.perspective);
    lines.push(`- ${markdown(parts)}`);
  }
  return `${lines.join('\n')}\n`;
}

await loadEngineForNode();

if (process.argv.includes('--search')) {
  console.log(JSON.stringify(search()));
} else {
  const l = createLocaliser('en');
  await mkdir(OUT, { recursive: true });
  // Emptied, not removed, so a shell open in the folder does not block the run.
  for (const name of await readdir(OUT))
    await rm(new URL(name, OUT), { recursive: true, force: true });
  const covered = new Set();
  for (const [index, setup] of GAMES.entries()) {
    const game = play(setup);
    for (const name of shown(game).keys()) covered.add(name);
    for (const view of VIEWS) {
      const file = new URL(`game-${index + 1}-${view.file}.md`, OUT);
      await writeFile(file, transcript(l, game, index + 1, view));
    }
    game.dispose();
  }
  const missing = Object.keys(SCENARIOS).filter((name) => !covered.has(name));
  if (missing.length > 0) throw new Error(`the transcripts miss ${missing.join(', ')}`);
  console.log(`Wrote ${GAMES.length * VIEWS.length} transcripts to ${fileURLToPath(OUT)}`);
}
