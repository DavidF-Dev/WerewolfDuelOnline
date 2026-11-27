// Searches for the tutorial's seed: prints the first whose deal gives the tutorial its hands.
import { defaultRulesConfig } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import { GameClient } from '@wwd/client-core';
import { MemoryReferee, seededRandom } from '@wwd/referee-memory';
import { createInMemoryPair } from '@wwd/transport';

const PLAYER_SEAT = 'p0';
const PLAYER_HAND = ['knight', 'seer', 'villager', 'witch'];
const OPPONENT_CARD = 'wolfen';
const MAX_SEEDS = 10_000;

const seedHex = (n) => n.toString(16).padStart(64, '0');

/** Resolves with the client's state once `ready` holds for it. */
function until(client, ready) {
  return new Promise((resolve) => {
    const off = client.state.subscribe((state) => {
      if (!ready(state)) return;
      resolve(state);
      // The first call runs before `off` is assigned.
      queueMicrotask(() => off());
    });
  });
}

/** The hands `seed` deals, set up as the tutorial sets up its table: the player joins first. */
async function deal(seed) {
  const referee = new MemoryReferee({ random: seededRandom(seed) });
  try {
    const room = referee.createRoom({
      ...defaultRulesConfig(),
      badge_start: { seat: PLAYER_SEAT },
    });
    const connect = (client) => {
      const [clientEnd, serverEnd] = createInMemoryPair();
      referee.accept(serverEnd);
      client.attach(clientEnd);
    };
    const player = new GameClient({ room, name: 'player' });
    const opponent = new GameClient({ room, name: 'opponent' });
    connect(player);
    await until(player, (s) => s.seat !== null);
    connect(opponent);
    const [mine, theirs] = await Promise.all([
      until(player, (s) => s.view !== null),
      until(opponent, (s) => s.view !== null),
    ]);
    player.dispose();
    opponent.dispose();
    const seat = (s) => s.view.players[s.seat === 'p0' ? 0 : 1];
    return {
      seat: mine.seat,
      badge: mine.view.badge,
      player: [...seat(mine).hand].sort(),
      opponent: [...seat(theirs).hand].sort(),
    };
  } finally {
    referee.close();
  }
}

await loadEngineForNode();
for (let n = 0; n < MAX_SEEDS; n++) {
  const seed = seedHex(n);
  const hands = await deal(seed);
  const wanted =
    hands.seat === PLAYER_SEAT &&
    hands.badge === PLAYER_SEAT &&
    hands.player.join() === PLAYER_HAND.join() &&
    hands.opponent.includes(OPPONENT_CARD);
  if (wanted) {
    console.log(seed);
    console.log(JSON.stringify(hands));
    process.exit(0);
  }
}
throw new Error(`no seed below ${MAX_SEEDS} deals the tutorial's hands`);
