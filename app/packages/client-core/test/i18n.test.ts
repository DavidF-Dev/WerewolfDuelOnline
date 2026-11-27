import { readFileSync } from 'node:fs';
import { FluentBundle } from '@fluent/bundle';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Character, Event, EventKind, Seat } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import { engineFtl } from '@wwd/engine';
import {
  characterParts,
  createLocaliser,
  isLocaleLoaded,
  loadLocale,
  plainText,
  richMessage,
  type MessageArgs,
  type RichKinds,
  type RichPart,
} from '../src/index.js';
import { localiserFromSources } from '../src/i18n.js';
import { uiFtl } from '../src/generated/ui-ftl.js';
import { Xorshift, finishedGame } from './helpers.js';

beforeAll(loadEngineForNode);

const GAME_TERMS = new Set([
  'Cross',
  'Crosses',
  'Fang',
  'Fangs',
  'Hourglass',
  'Hourglasses',
  'Potion',
  'Health',
  'Badge',
  'Fool',
  'Hunter',
  'Wolf',
  'King',
  'Knight',
  'Wolfen',
  'Seer',
  'Witch',
  'Beauty',
  'Villager',
  'Human',
  'Humans',
  'Werewolf',
  'Werewolves',
]);

/** Acronyms, which keep their capitals in sentence case. */
const ACRONYMS = new Set(['PIN', 'PINs']);

/** Every single-line message of the UI file, as [id, value]. */
function uiMessages(): Array<[string, string]> {
  const ftl = readFileSync(new URL('../locales/en/ui.ftl', import.meta.url), 'utf8');
  return ftl.split('\n').flatMap((line): Array<[string, string]> => {
    const match = /^([a-z][a-z0-9-]*)\s*=\s*(.+)$/.exec(line);
    return match === null ? [] : [[match[1]!, match[2]!]];
  });
}

/** The capitalised words in a UI string that sentence case does not allow. */
function sentenceCaseProblems(value: string): string[] {
  // A value of symbols and placeholders alone, such as "+{ $n }", has no words to capitalise.
  if (!/\p{L}/u.test(value.replace(/\{[^{}]*\}/g, ''))) return [];
  // A value may open with a placeholder, such as a number or a character's name.
  if (!/^(\p{Lu}|\{ (\$|CHARACTER\())/u.test(value)) return [value];
  // Placeables hold Fluent syntax; text in curly quotes is another product's label, as printed.
  const words = value
    .replace(/\{[^{}]*\}/g, '{}')
    .replace(/“[^”]*”/gu, '“label”')
    .split(/\s+/);
  const problems: string[] = [];
  for (const [i, word] of words.entries()) {
    // The first word of each sentence or `·` segment, or of a quoted label, is capitalised.
    if (i === 0 || /[.?!]$/.test(words[i - 1]!) || words[i - 1] === '·' || /^["“]/u.test(word))
      continue;
    const bare = word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    if (/^\p{Lu}/u.test(bare) && !GAME_TERMS.has(bare) && !ACRONYMS.has(bare)) problems.push(bare);
  }
  return problems;
}

const COMMITMENT = '07'.repeat(32);
const ev = (kind: EventKind): Event => ({ visibility: 'public', kind });

interface Golden {
  event: EventKind;
  /** Perspective p0, perspective p1, no perspective. */
  text: [string, string, string];
}

// Every event concerns p0 unless noted, so perspective p0 reads as "you".
const GOLDEN: Golden[] = [
  {
    event: {
      game_started: {
        config: { tiebreak: 'hourglasses_then_badge', min_targets: 1, badge_start: 'random' },
        seed_commitment: COMMITMENT,
      },
    },
    text: [
      `The game begins. Seed commitment: ${COMMITMENT}.`,
      `The game begins. Seed commitment: ${COMMITMENT}.`,
      `The game begins. Seed commitment: ${COMMITMENT}.`,
    ],
  },
  {
    event: { round_started: { round: 2, badge: 'p0' } },
    text: [
      'Round 2 begins. You hold the Badge.',
      'Round 2 begins. Your opponent holds the Badge.',
      'Round 2 begins. Player 1 holds the Badge.',
    ],
  },
  {
    event: { hand_dealt: { seat: 'p0', cards: ['hunter', 'knight', 'seer'] } },
    text: [
      'You are dealt Hunter, Knight and Seer.',
      'Your opponent is dealt Hunter, Knight and Seer.',
      'Player 1 is dealt Hunter, Knight and Seer.',
    ],
  },
  {
    event: { plan_submitted: { seat: 'p0', target_count: 1 } },
    text: [
      'You seal a plan with 1 target card.',
      'Your opponent seals a plan with 1 target card.',
      'Player 1 seals a plan with 1 target card.',
    ],
  },
  {
    event: { plan_submitted: { seat: 'p0', target_count: 3 } },
    text: [
      'You seal a plan with 3 target cards.',
      'Your opponent seals a plan with 3 target cards.',
      'Player 1 seals a plan with 3 target cards.',
    ],
  },
  {
    event: { hourglasses_placed: { seat: 'p0', n: 2 } },
    text: [
      'You place 2 Hourglasses.',
      'Your opponent places 2 Hourglasses.',
      'Player 1 places 2 Hourglasses.',
    ],
  },
  {
    event: { hourglasses_placed: { seat: 'p0', n: 0 } },
    text: [
      'You place no Hourglasses.',
      'Your opponent places no Hourglasses.',
      'Player 1 places no Hourglasses.',
    ],
  },
  {
    event: { hourglasses_placed: { seat: 'p0', n: 1 } },
    text: [
      'You place 1 Hourglass.',
      'Your opponent places 1 Hourglass.',
      'Player 1 places 1 Hourglass.',
    ],
  },
  {
    event: { potion_target_chosen: { seat: 'p0', card: 'seer' } },
    text: [
      'You aim the Potion at the Seer.',
      'Your opponent aims the Potion at the Seer.',
      'Player 1 aims the Potion at the Seer.',
    ],
  },
  {
    event: {
      plans_revealed: {
        plans: [
          { character: 'hunter', targets: ['fool', { character: 'seer' }] },
          { character: 'villager', targets: [] },
        ],
        effective: [5, 8],
        order: ['p1', 'p0'],
      },
    },
    text: [
      'Plans revealed. You play Hunter targeting the Fool and the Seer at initiative 5. Your opponent plays Villager with no targets at initiative 8. Your opponent resolves first.',
      'Plans revealed. You play Villager with no targets at initiative 8. Your opponent plays Hunter targeting the Fool and the Seer at initiative 5. You resolve first.',
      'Plans revealed. Player 1 plays Hunter targeting the Fool and the Seer at initiative 5. Player 2 plays Villager with no targets at initiative 8. Player 2 resolves first.',
    ],
  },
  {
    event: { potion_resolved: { target: 'seer', victim: 'p0', hit: true, health_lost: 1 } },
    text: [
      'The Potion hits your Seer! You lose 1 Health.',
      "The Potion hits your opponent's Seer! Your opponent loses 1 Health.",
      "The Potion hits Player 1's Seer! Player 1 loses 1 Health.",
    ],
  },
  {
    event: { potion_resolved: { target: 'seer', victim: 'p0', hit: false, health_lost: 0 } },
    text: [
      'The Potion misses: you did not play the Seer.',
      'The Potion misses: your opponent did not play the Seer.',
      'The Potion misses: Player 1 did not play the Seer.',
    ],
  },
  {
    event: { character_resolved: { seat: 'p0', character: 'hunter' } },
    text: [
      'Your Hunter resolves.',
      "Your opponent's Hunter resolves.",
      "Player 1's Hunter resolves.",
    ],
  },
  {
    event: { marker_gained: { seat: 'p0', marker: 'cross', from_opponent: true } },
    text: [
      'You take 1 Cross from your opponent.',
      'Your opponent takes 1 Cross from you.',
      'Player 1 takes 1 Cross from Player 2.',
    ],
  },
  {
    event: { marker_gained: { seat: 'p0', marker: 'fang', from_opponent: false } },
    text: ['You gain 1 Fang.', 'Your opponent gains 1 Fang.', 'Player 1 gains 1 Fang.'],
  },
  {
    event: { marker_gained: { seat: 'p0', marker: 'potion', from_opponent: false } },
    text: ['You gain the Potion.', 'Your opponent gains the Potion.', 'Player 1 gains the Potion.'],
  },
  {
    event: { marker_spent: { seat: 'p0', marker: 'fang', n: 2 } },
    text: ['You spend 2 Fangs.', 'Your opponent spends 2 Fangs.', 'Player 1 spends 2 Fangs.'],
  },
  {
    event: { marker_spent: { seat: 'p0', marker: 'cross', n: 1 } },
    text: ['You spend 1 Cross.', 'Your opponent spends 1 Cross.', 'Player 1 spends 1 Cross.'],
  },
  {
    event: {
      attack_hit: {
        seat: 'p0',
        target_seat: 'p1',
        attacker: 'knight',
        character: 'wolfen',
        health_lost: 1,
      },
    },
    text: [
      "Your Knight hits your opponent's Wolfen! Your opponent loses 1 Health.",
      "Your opponent's Knight hits your Wolfen! You lose 1 Health.",
      "Player 1's Knight hits Player 2's Wolfen! Player 2 loses 1 Health.",
    ],
  },
  {
    event: { attack_missed: { seat: 'p0', attacker: 'knight' } },
    text: ['Your Knight misses.', "Your opponent's Knight misses.", "Player 1's Knight misses."],
  },
  {
    event: { attack_forfeited: { seat: 'p0', reason: 'no_cross' } },
    text: [
      'You make no attack: there is no Cross to spend.',
      'Your opponent makes no attack: there is no Cross to spend.',
      'Player 1 makes no attack: there is no Cross to spend.',
    ],
  },
  {
    event: { round_ended: { round: 3, next_badge: 'p1' } },
    text: [
      'Round 3 ends. Your opponent takes the Badge.',
      'Round 3 ends. You take the Badge.',
      'Round 3 ends. Player 2 takes the Badge.',
    ],
  },
  {
    event: { next_round_requested: { seat: 'p0' } },
    text: [
      'You are ready for the next round.',
      'Your opponent is ready for the next round.',
      'Player 1 is ready for the next round.',
    ],
  },
  {
    event: { game_over: { winner: 'p0', reason: 'health' } },
    text: [
      "You win by reducing your opponent's Health to zero.",
      'Your opponent wins by reducing your Health to zero.',
      "Player 1 wins by reducing Player 2's Health to zero.",
    ],
  },
  {
    event: { game_over: { winner: 'p0', reason: 'fangs' } },
    text: [
      'You win by collecting enough Fangs.',
      'Your opponent wins by collecting enough Fangs.',
      'Player 1 wins by collecting enough Fangs.',
    ],
  },
  {
    event: { resigned: { seat: 'p0' } },
    text: ['You resign.', 'Your opponent resigns.', 'Player 1 resigns.'],
  },
  {
    event: { game_over: { winner: 'p1', reason: 'resignation' } },
    text: [
      'Your opponent wins because you resigned.',
      'You win because your opponent resigned.',
      'Player 2 wins because Player 1 resigned.',
    ],
  },
  {
    event: { game_over: { winner: 'p1', reason: 'crosses' } },
    text: [
      'Your opponent wins by collecting enough Crosses.',
      'You win by collecting enough Crosses.',
      'Player 2 wins by collecting enough Crosses.',
    ],
  },
  {
    event: { discard_revealed: { round: 2, character: 'wolf_beauty' } },
    text: [
      'The card set aside in round 2 was the Wolf Beauty.',
      'The card set aside in round 2 was the Wolf Beauty.',
      'The card set aside in round 2 was the Wolf Beauty.',
    ],
  },
  {
    event: { segment_started: { round: 3, seed_commitment: COMMITMENT } },
    text: [
      'The game resumes in round 3.',
      'The game resumes in round 3.',
      'The game resumes in round 3.',
    ],
  },
];

/** One event per distinct kind and shape, gathered from several finished games. */
function sampleEvents(): Event[] {
  const events = new Map<string, Event>();
  for (let seed = 1; seed <= 12; seed++) {
    const game = finishedGame(seed.toString(16).padStart(64, '0'), new Xorshift(seed));
    for (const [, event] of game.eventsSince(0, 'omniscient')) {
      events.set(JSON.stringify(event.kind), event);
    }
    game.dispose();
  }
  return [...events.values()];
}

describe('localiser', () => {
  const loc = createLocaliser('en');
  const perspectives: Array<Seat | null> = ['p0', 'p1', null];

  it('covers every event kind in the golden table', () => {
    const kinds = new Set(GOLDEN.map((g) => Object.keys(g.event)[0]));
    expect(kinds.size).toBe(20);
  });

  for (const golden of GOLDEN) {
    it(`renders ${JSON.stringify(golden.event)}`, () => {
      const rendered = perspectives.map((p) => loc.renderEvent(ev(golden.event), p));
      expect(rendered).toEqual(golden.text);
    });
  }

  it('renders every event of real games without missing messages', () => {
    for (const event of sampleEvents()) {
      for (const perspective of perspectives) {
        const text = loc.renderEvent(event, perspective);
        expect(text, JSON.stringify(event.kind)).not.toMatch(/[{}$]|undefined/);
        expect(text, JSON.stringify(event.kind)).not.toMatch(
          /\b(event|seat|character|marker|plan|forfeit|win-reason)-/,
        );
        expect(text).toMatch(/^\p{Lu}/u);
        expect(text).toMatch(/[.!]$/);
      }
    }
  });

  it('returns the id for an unknown message', () => {
    expect(loc.t('no-such-message')).toBe('no-such-message');
  });

  it('ui strings are sentence case', () => {
    const values = uiMessages().map(([, value]) => value);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(sentenceCaseProblems(value), value).toEqual([]);
  });

  it('exempts only a value without words of its own from opening with a capital', () => {
    expect(sentenceCaseProblems('→ { $target }')).toEqual([]);
    expect(sentenceCaseProblems('+?')).toEqual([]);
    expect(sentenceCaseProblems('→ the { $target }')).toEqual(['→ the { $target }']);
  });

  it('exempts only a third-party label in curly quotes from sentence case', () => {
    expect(sentenceCaseProblems('Tap the share button, then “Add to Home Screen”.')).toEqual([]);
    expect(sentenceCaseProblems('Tap the share button, then "Add to Home Screen".')).toEqual([
      'Home',
      'Screen',
    ]);
    expect(sentenceCaseProblems('Tap “Share” on the Home Screen.')).toEqual(['Home', 'Screen']);
  });
});

describe('loading', () => {
  it('German and Japanese text loads only when it is asked for', async () => {
    expect(Object.keys(engineFtl)).toEqual(['en']);
    expect(Object.keys(uiFtl)).toEqual(['en']);
    expect(isLocaleLoaded('en')).toBe(true);
    expect(isLocaleLoaded('ja')).toBe(false);
    expect(() => createLocaliser('ja')).toThrow(/not loaded/);
    await Promise.all([loadLocale('ja'), loadLocale('ja')]);
    expect(isLocaleLoaded('ja')).toBe(true);
    expect(isLocaleLoaded('de')).toBe(false);
    expect(createLocaliser('ja').t('character-knight')).toBe('騎士');
    await loadLocale('en');
  });
});

const fixture = (name: string): string =>
  readFileSync(
    new URL(`../../../../engine/crates/wwd-cli/tests/fixtures/${name}.ftl`, import.meta.url),
    'utf8',
  );

/** The English localiser with the test-only `overrides` fixtures loaded over it. */
const englishWith = (...overrides: string[]) =>
  localiserFromSources('en', 'en-GB', [engineFtl['en']!, uiFtl['en']!], overrides.map(fixture));

const ARTICLES = ['def', 'indef', 'none'] as const;
const CASES = ['nom', 'acc', 'dat', 'gen'] as const;

describe('grammar', () => {
  it('CHARACTER returns each form from the locale file', () => {
    const l = englishWith('grammar', 'probes');
    const forms = (c: string) =>
      ARTICLES.flatMap((article) => CASES.map((kase) => l.t(`probe-${article}-${kase}`, { c })));
    expect(forms('hunter')).toEqual([
      '[der Jäger]',
      '[den Jäger]',
      '[dem Jäger]',
      '[des Jägers]',
      '[ein Jäger]',
      '[einen Jäger]',
      '[einem Jäger]',
      '[eines Jägers]',
      '[Jäger]',
      '[Jäger]',
      '[Jäger]',
      '[Jägers]',
    ]);
    expect(forms('witch')).toEqual([
      '[die Hexe]',
      '[die Hexe]',
      '[der Hexe]',
      '[der Hexe]',
      '[eine Hexe]',
      '[eine Hexe]',
      '[einer Hexe]',
      '[einer Hexe]',
      '[Hexe]',
      '[Hexe]',
      '[Hexe]',
      '[Hexe]',
    ]);
    expect(l.t('probe-default', { c: 'hunter' })).toBe('[Jäger]');
    expect(l.t('probe-none-acc', { c: 'wolf_king' })).toBe('[Wolf King]');
    expect(l.t('probe-bad-case', { c: 'hunter' })).toBe('probe-bad-case');
    expect(l.t('probe-default', { c: 'nobody' })).toBe('probe-default');
  });

  it('CHARACTER returns the English name for every option', () => {
    const l = englishWith('probes');
    const ids = [
      'hunter',
      'wolf_king',
      'knight',
      'wolfen',
      'seer',
      'witch',
      'wolf_beauty',
      'villager',
    ];
    for (const c of ids) {
      const name = l.t(`character-${c.replaceAll('_', '-')}`);
      expect(l.t('probe-default', { c })).toBe(`[${name}]`);
      for (const article of ARTICLES) {
        for (const kase of CASES) expect(l.t(`probe-${article}-${kase}`, { c })).toBe(`[${name}]`);
      }
    }
  });

  it('a list takes the case its message declares', () => {
    const l = englishWith('grammar');
    const dealt = ev({ hand_dealt: { seat: 'p0', cards: ['hunter', 'witch'] } });
    expect(l.renderEvent(dealt, null)).toBe('Player 1 bekommt den Jäger and die Hexe.');
    const revealed = ev({
      plans_revealed: {
        plans: [
          { character: 'hunter', targets: [{ character: 'witch' }, 'fool'] },
          { character: 'witch', targets: [{ character: 'hunter' }] },
        ],
        effective: [1, 6],
        order: ['p0', 'p1'],
      },
    });
    expect(l.renderEvent(revealed, null)).toBe(
      'Plans revealed. Player 1 plays den Jäger gegen die Hexe and den Narren at initiative 1. ' +
        'Player 2 plays die Hexe gegen den Jäger at initiative 6. Player 1 resolves first.',
    );
  });

  it('a broken character form makes the message fall back to its id', () => {
    const l = englishWith('broken-form', 'probes');
    const cards: Character[] = ['hunter', 'witch'];
    expect(l.t('probe-def-acc', { c: 'hunter' })).toBe('probe-def-acc');
    expect(() => characterParts(l, 'hunter')).toThrow();
    const resolved = ev({ character_resolved: { seat: 'p0', character: 'hunter' } });
    expect(l.renderEvent(resolved, null)).toBe('event-character-resolved');
    const dealt = ev({ hand_dealt: { seat: 'p0', cards } });
    expect(l.renderEvent(dealt, 'p0')).toBe('event-hand-dealt');
    expect(l.richEvent(dealt, 'p0')).toEqual([{ text: 'event-hand-dealt' }]);
    expect(plainText(l.cardsMessage('cli-your-hand', cards))).toBe('cli-your-hand');
    expect(plainText(l.plan({ character: 'hunter', targets: [{ character: 'witch' }] }))).toBe(
      'plan-targeting',
    );
  });

  it('an unknown character is an error, and the forms message is not a character', () => {
    const l = englishWith('grammar', 'probes');
    for (const c of ['nobody', 'form', 'grammar-character-form', 'character-form']) {
      expect(l.t('probe-default', { c }), c).toBe('probe-default');
      expect(l.t('probe-gender', { c }), c).toBe('probe-gender');
      expect(() => characterParts(l, c), c).toThrow();
    }
  });

  it('GENDER selects on a character gender', () => {
    const l = englishWith('grammar', 'probes');
    expect(l.t('probe-gender', { c: 'hunter' })).toBe('[er]');
    expect(l.t('probe-gender', { c: 'witch' })).toBe('[sie]');
    expect(l.t('probe-gender', { c: 'wolf_king' })).toBe('[es]');
    expect(l.t('probe-gender', { c: 'wolf-king' })).toBe('[es]');
    expect(plainText(richMessage(l, 'probe-gender', { c: 'witch' }, { c: 'character' }))).toBe(
      '[sie]',
    );
  });

  it("formats a character's forms once per localiser", () => {
    const l = englishWith('grammar', 'probes');
    l.t('probe-def-acc', { c: 'hunter' });
    const formatted = vi.spyOn(FluentBundle.prototype, 'formatPattern');
    try {
      expect(l.t('probe-def-acc', { c: 'hunter' })).toBe('[den Jäger]');
      expect(formatted).toHaveBeenCalledTimes(1);
    } finally {
      formatted.mockRestore();
    }
  });
});

/** An event's rich text, with player, character and marker parts tagged. */
const tagged = (parts: readonly RichPart[]): string =>
  parts
    .map((part) =>
      'text' in part
        ? part.text
        : 'player' in part
          ? `<p>${part.player}</p>`
          : 'character' in part
            ? `<c>${part.character}</c>`
            : `<m ${part.marker}>${part.label}</m>`,
    )
    .join('');

describe('English text', () => {
  it('English transcripts are unchanged', async () => {
    const l = createLocaliser('en');
    const lines: string[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      const game = finishedGame(seed.toString(16).padStart(64, '0'), new Xorshift(seed));
      for (const perspective of ['p0', 'p1', null] as const) {
        lines.push(`# Game ${seed}, ${perspective ?? 'replay'}`, '');
        for (const [, event] of game.eventsSince(0, 'omniscient')) {
          lines.push(`- ${tagged(l.richEvent(event, perspective))}`);
        }
        lines.push('');
      }
      game.dispose();
    }
    await expect(lines.join('\n')).toMatchFileSnapshot('./snapshots/english-transcripts.md');
  });

  it('English interface messages naming characters are unchanged', async () => {
    const l = createLocaliser('en');
    const characters: Character[] = [
      'hunter',
      'wolf_king',
      'knight',
      'wolfen',
      'seer',
      'witch',
      'wolf_beauty',
      'villager',
    ];
    const marked: RichKinds = {
      character: 'character',
      card: 'character',
      firstCharacter: 'character',
      secondCharacter: 'character',
    };
    const line = (id: string, args: MessageArgs) =>
      `- ${id}: ${tagged(richMessage(l, id, args, marked))}`;
    const lines: string[] = [];
    for (const [i, character] of characters.entries()) {
      const other = characters[(i + 3) % characters.length]!;
      const faction = l.t(i % 2 === 0 ? 'faction-human' : 'faction-werewolf');
      lines.push(`# ${character}`, '');
      lines.push(
        line('card-character', { character, initiative: i + 1, faction }),
        line('card-name', { character, initiative: i + 1, faction, ability: 'Ability.' }),
        line('round-summary-set-aside', { character }),
        line('reveal-initiative', { character, effective: i + 2, printed: i + 1 }),
        line('reveal-initiative-label', { character }),
        line('showdown-out-yours', { owner: l.t('player-your-cap'), character }),
        line('showdown-out-opponent', { owner: l.t('player-opponent-cap'), character }),
        line('describe-potion-target', { card: character }),
        line('describe-order', { first: 'you', firstCharacter: character, secondCharacter: other }),
        line('describe-order', {
          first: 'opponent',
          firstCharacter: character,
          secondCharacter: other,
        }),
        line('plan-summary-short', { character, targets: 'Fool' }),
        line('plan-summary-short-none', { character }),
        line('command-choose-potion-target', { card: character }),
        `- describe-hand: ${plainText(l.cardsMessage('describe-hand', [character, other]))}`,
        `- plan: ${tagged(l.plan({ character, targets: ['fool', { character: other }] }))}`,
        `- plan: ${tagged(l.plan({ character, targets: [] }))}`,
        '',
      );
    }
    await expect(lines.join('\n')).toMatchFileSnapshot('./snapshots/english-interface.md');
  });
});
