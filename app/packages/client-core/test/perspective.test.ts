import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game, defaultRulesConfig } from '@wwd/engine';
import type { Character, Event, EventKind, Seat } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import {
  createLocaliser,
  loadLocale,
  LOCALES,
  plainText,
  type MarkerId,
  type Translator,
} from '../src/index.js';
import { CASES } from '../src/grammar.js';
import { localiserFromSources } from '../src/i18n.js';
import { renderEvent, richEvent, type ListParts } from '../src/render-event.js';
import { Xorshift, finishedGame, isOver } from './helpers.js';

// Names and markers render as sentinels; each must stand under the seat phrase of its owner.

beforeAll(async () => {
  await loadEngineForNode();
  await Promise.all(LOCALES.map(loadLocale));
});

const KINDS = [
  'game_started',
  'round_started',
  'hand_dealt',
  'plan_submitted',
  'hourglasses_placed',
  'potion_target_chosen',
  'plans_revealed',
  'potion_resolved',
  'character_resolved',
  'marker_gained',
  'marker_spent',
  'attack_hit',
  'attack_missed',
  'attack_forfeited',
  'round_ended',
  'next_round_requested',
  'game_over',
  'resigned',
  'segment_started',
  'discard_revealed',
] as const;

type KindName = (typeof KINDS)[number];
const kindName = (kind: EventKind): KindName => Object.keys(kind)[0] as KindName;

const other = (seat: Seat): Seat => (seat === 'p0' ? 'p1' : 'p0');

interface Facts {
  /** Characters the event ties to a seat. */
  owned: Array<[Character, Seat]>;
  /** Characters the event names without tying them to anybody. */
  unowned: Character[];
}

/** Who the event is about (the first seat its sentence names), and whose each marker is. */
interface SeatFacts {
  subject: Seat | null;
  markers: Array<[MarkerId, Seat]>;
}

function seatFacts(kind: EventKind): SeatFacts {
  const about = (subject: Seat, markers: Array<[MarkerId, Seat]> = []): SeatFacts => ({
    subject,
    markers,
  });
  if ('round_started' in kind) {
    const { badge } = kind.round_started;
    return about(badge, [['badge', badge]]);
  }
  if ('hand_dealt' in kind) return about(kind.hand_dealt.seat);
  if ('plan_submitted' in kind) return about(kind.plan_submitted.seat);
  if ('hourglasses_placed' in kind) {
    const { seat } = kind.hourglasses_placed;
    return about(seat, [['hourglass', seat]]);
  }
  if ('potion_target_chosen' in kind) return about(kind.potion_target_chosen.seat);
  if ('potion_resolved' in kind) {
    const { victim, hit } = kind.potion_resolved;
    return about(victim, hit ? [['health', victim]] : []);
  }
  if ('character_resolved' in kind) return about(kind.character_resolved.seat);
  if ('marker_gained' in kind) {
    const { seat, marker } = kind.marker_gained;
    return about(seat, [[marker, seat]]);
  }
  if ('marker_spent' in kind) {
    const { seat, marker } = kind.marker_spent;
    return about(seat, [[marker, seat]]);
  }
  if ('attack_hit' in kind) {
    const { seat, target_seat } = kind.attack_hit;
    return about(seat, [['health', target_seat]]);
  }
  if ('attack_missed' in kind) return about(kind.attack_missed.seat);
  if ('attack_forfeited' in kind) {
    const { seat, reason } = kind.attack_forfeited;
    if (reason === 'no_targets') return about(seat);
    return about(seat, [[reason === 'cannot_pay_fangs' ? 'fang' : 'cross', seat]]);
  }
  if ('round_ended' in kind) {
    const { next_badge } = kind.round_ended;
    return about(next_badge, [['badge', next_badge]]);
  }
  if ('next_round_requested' in kind) return about(kind.next_round_requested.seat);
  if ('resigned' in kind) return about(kind.resigned.seat);
  if ('game_over' in kind) {
    const { winner, reason } = kind.game_over;
    if (reason === 'health') return about(winner, [['health', other(winner)]]);
    if (reason === 'fangs') return about(winner, [['fang', winner]]);
    if (reason === 'crosses') return about(winner, [['cross', winner]]);
    return about(winner);
  }
  return { subject: null, markers: [] };
}

function facts(kind: EventKind): Facts {
  if ('hand_dealt' in kind) {
    const { seat, cards } = kind.hand_dealt;
    return { owned: cards.map((c) => [c, seat]), unowned: [] };
  }
  if ('potion_target_chosen' in kind) {
    return { owned: [], unowned: [kind.potion_target_chosen.card] };
  }
  if ('plans_revealed' in kind) {
    const { plans } = kind.plans_revealed;
    return {
      owned: [
        [plans[0].character, 'p0'],
        [plans[1].character, 'p1'],
      ],
      unowned: plans.flatMap((p) => p.targets.flatMap((t) => (t === 'fool' ? [] : [t.character]))),
    };
  }
  if ('potion_resolved' in kind) {
    const { target, victim } = kind.potion_resolved;
    return { owned: [[target, victim]], unowned: [] };
  }
  if ('character_resolved' in kind) {
    const { seat, character } = kind.character_resolved;
    return { owned: [[character, seat]], unowned: [] };
  }
  if ('attack_hit' in kind) {
    const { seat, target_seat, attacker, character } = kind.attack_hit;
    return {
      owned: [
        [attacker, seat],
        [character, target_seat],
      ],
      unowned: [],
    };
  }
  if ('attack_missed' in kind) {
    const { seat, attacker } = kind.attack_missed;
    return { owned: [[attacker, seat]], unowned: [] };
  }
  if ('discard_revealed' in kind) return { owned: [], unowned: [kind.discard_revealed.character] };
  return { owned: [], unowned: [] };
}

/** How a language names the seats in event text, for the ownership check. */
interface SeatWords {
  /** The phrases that name a seat, with character and marker sentinels and sentence ends. */
  phrase: RegExp;
  /** The seat a phrase names: a neutral seat, or `'opponent'` or `'you'` for a perspective. */
  seat: (phrase: string) => Seat | 'opponent' | 'you';
  /** Whether a phrase straight after a character's name names that character's owner. */
  follows: (phrase: string) => boolean;
  /** Whether a phrase names who something comes from, which owns nothing after it. */
  giver?: (phrase: string) => boolean;
}

const ENGLISH_SEATS: SeatWords = {
  phrase: /your opponent(?:'s)?|your|you|player 1(?:'s)?|player 2(?:'s)?|«[a-z_]+»|[.!?]/giu,
  seat: (phrase) =>
    phrase.startsWith('player 1')
      ? 'p0'
      : phrase.startsWith('player 2')
        ? 'p1'
        : phrase.startsWith('your opponent')
          ? 'opponent'
          : 'you',
  follows: () => false,
};

/** German names an owner before the name ("dein Jäger") or after it ("der Jäger deines Gegenübers"). */
const GERMAN_SEATS: SeatWords = {
  phrase:
    /(?<!\p{L})(?:deines gegenübers|von (?:deinem gegenüber|dir|spieler [12])|deinem gegenüber|dein gegenüber|spieler [12]|deinen|deinem|deiner|deines|deine|dein|dich|dir|du)(?!\p{L})|«[a-z_]+»|[.!?]/giu,
  seat: (phrase) =>
    phrase.endsWith('spieler 1')
      ? 'p0'
      : phrase.endsWith('spieler 2')
        ? 'p1'
        : phrase.includes('gegenüber')
          ? 'opponent'
          : 'you',
  follows: (phrase) => phrase === 'deines gegenübers' || phrase.startsWith('von '),
};

/** Japanese names an owner before what it owns, with の: "あなたの騎士", "プレイヤー2の若狼". */
const JAPANESE_SEATS: SeatWords = {
  phrase: /(?:相手|あなた|プレイヤー[12])から|相手|あなた|プレイヤー[12]|«[a-z_]+»|[。！？]/gu,
  seat: (phrase) =>
    phrase === 'プレイヤー1'
      ? 'p0'
      : phrase === 'プレイヤー2'
        ? 'p1'
        : phrase === '相手'
          ? 'opponent'
          : 'you',
  follows: () => false,
  giver: (phrase) => phrase.endsWith('から'),
};

/** Each sentinel in `text` with the owner in force where it stands, and the first seat named. */
function attributions(
  text: string,
  perspective: Seat | null,
  words: SeatWords = ENGLISH_SEATS,
): { found: Array<[string, Seat | null]>; first: Seat | null } {
  const found: Array<[string, Seat | null]> = [];
  let owner: Seat | null = null;
  let first: Seat | null = null;
  // Where the last character's name ends, while nothing but spaces follows it.
  let character: { index: number; end: number } | null = null;
  for (const match of text.matchAll(words.phrase)) {
    const [token] = match;
    const phrase = token.toLowerCase();
    if (/^[.!?。！？]$/u.test(phrase)) {
      owner = null;
      character = null;
      continue;
    }
    if (phrase.startsWith('«')) {
      found.push([phrase.slice(1, -1), owner]);
      character = phrase.startsWith('«m_')
        ? null
        : { index: found.length - 1, end: match.index + token.length };
      continue;
    }
    if (words.giver?.(phrase) === true) {
      character = null;
      continue;
    }
    const seat = words.seat(phrase);
    if (seat === 'p0' || seat === 'p1') owner = seat;
    else if (perspective === null) throw new Error(`"${token}" with no perspective: ${text}`);
    else owner = seat === 'opponent' ? other(perspective) : perspective;
    const after = character !== null && text.slice(character.end, match.index).trim() === '';
    if (after && words.follows(phrase)) found[character!.index]![1] = owner;
    character = null;
    first ??= owner;
  }
  return { found, first };
}

/** The sentinel for a marker message: `marker-fang-count` and `marker-fangs` are both «m_fang». */
function markerSentinel(id: string): string {
  const name = id
    .slice('marker-'.length)
    .replace(/-count$/u, '')
    .replace(/^crosses$/u, 'cross')
    .replace(/^fangs$/u, 'fang');
  return `«m_${name}»`;
}

/** Joins items with commas, as list parts. */
const list: ListParts = (items) =>
  items.flatMap((value, i) => [
    ...(i === 0 ? [] : [{ type: 'literal' as const, value: ', ' }]),
    { type: 'element' as const, value },
  ]);

const CHARACTERS: readonly Character[] = [
  'hunter',
  'wolf_king',
  'knight',
  'wolfen',
  'seer',
  'witch',
  'wolf_beauty',
  'villager',
];

/** A language the event text is checked in. */
interface Language {
  locale: 'en' | 'de' | 'ja';
  formatLocale: string;
  seats: SeatWords;
  /** Marker names, which must always be marker parts. */
  markerWords: RegExp;
  /** Words for a player, which must always be player parts. */
  playerText: RegExp;
  /** Everything that may be emphasised as a player. */
  playerWords: readonly string[];
  /** How a neutral view names a seat. */
  neutral: RegExp;
}

const ENGLISH: Language = {
  locale: 'en',
  formatLocale: 'en-GB',
  seats: ENGLISH_SEATS,
  markerWords: /\b(Cross|Crosses|Fangs?|Hourglass|Hourglasses|Potion|Health|Badge)\b/u,
  playerText: /\b(you|your)\b/iu,
  playerWords: [
    'You',
    'you',
    'Your',
    'your',
    'Your opponent',
    'your opponent',
    'Player 1',
    'Player 2',
  ],
  neutral: /Player [12]/u,
};

const GERMAN: Language = {
  locale: 'de',
  formatLocale: 'de-DE',
  seats: GERMAN_SEATS,
  markerWords: /(?<!\p{L})(Kreuze?|Reißz[aä]hne?|Sanduhr(?:en)?|Trank|Leben|Abzeichen)(?!\p{L})/u,
  playerText: /(?<!\p{L})(du|dich|dir|dein\p{L}*|gegenüber\p{L}*)(?!\p{L})/iu,
  playerWords: [
    'Du',
    'du',
    'dir',
    'Dein',
    'dein',
    'deine',
    'deinen',
    'Dein Gegenüber',
    'dein Gegenüber',
    'deinem Gegenüber',
    'deines Gegenübers',
    'Spieler 1',
    'Spieler 2',
  ],
  neutral: /Spieler [12]/u,
};

const JAPANESE: Language = {
  locale: 'ja',
  formatLocale: 'ja-JP',
  seats: JAPANESE_SEATS,
  markerWords: /十字架|牙|砂時計|薬|体力|バッジ/u,
  playerText: /あなた|相手/u,
  playerWords: ['あなた', '相手', 'プレイヤー1', 'プレイヤー2'],
  neutral: /プレイヤー[12]/u,
};

const sources = (locale: Language['locale']): string[] => [
  readFileSync(new URL(`../../../../engine/locales/${locale}/engine.ftl`, import.meta.url), 'utf8'),
  readFileSync(new URL(`../locales/${locale}/ui.ftl`, import.meta.url), 'utf8'),
];

/** Messages that name each character by a sentinel, such as «wolf_king», in every case. */
function sentinelNames(language: Language): string {
  const real = localiserFromSources(
    language.locale,
    language.formatLocale,
    sources(language.locale),
  );
  return CHARACTERS.map((c) => {
    const id = `character-${c.replaceAll('_', '-')}`;
    const gender = real.t(`${id}.gender`);
    const forms = gender === `${id}.gender` ? [] : [`gender = ${gender}`];
    if (language.locale === 'de') forms.push(...CASES.map((kase) => `${kase} = «${c}»`));
    return [`${id} = «${c}»`, ...forms.map((form) => `    .${form}`)].join('\n');
  }).join('\n');
}

/** The localiser, with each character and marker name replaced by a sentinel. */
function sentinelTranslator(language: Language = ENGLISH): Translator {
  const real = localiserFromSources(
    language.locale,
    language.formatLocale,
    sources(language.locale),
    [sentinelNames(language)],
  );
  return { t: (id, args) => (id.startsWith('marker-') ? markerSentinel(id) : real.t(id, args)) };
}

/** Problems with how `event` attributes characters, markers and its subject, as seen from `perspective`. */
function ownershipProblems(
  tr: Translator,
  event: Event,
  perspective: Seat | null,
  language: Language = ENGLISH,
): string[] {
  const text = renderEvent(tr, list, event, perspective);
  const { found, first } = attributions(text, perspective, language.seats);
  const { owned, unowned } = facts(event.kind);
  const { subject, markers } = seatFacts(event.kind);
  const view = perspective ?? 'replay';
  const problems: string[] = [];
  for (const [marker, seat] of markers) {
    if (!found.some(([name, owner]) => name === `m_${marker}` && owner === seat)) {
      problems.push(`${view}: the ${marker} should be ${seat}'s in "${text}"`);
    }
  }
  if (subject !== null && first !== subject) {
    problems.push(`${view}: the sentence should be about ${subject} in "${text}"`);
  }
  for (const [character, seat] of owned) {
    if (!found.some(([name, owner]) => name === character && owner === seat)) {
      problems.push(`${perspective ?? 'replay'}: ${character} should be ${seat}'s in "${text}"`);
    }
  }
  for (const [name] of found.filter(([token]) => !token.startsWith('m_'))) {
    const known = owned.some(([c]) => c === name) || unowned.some((c) => c === name);
    if (!known) problems.push(`${perspective ?? 'replay'}: unexpected ${name} in "${text}"`);
  }
  return problems;
}

/** Plays games until each event kind has appeared, including a resignation and a resumed segment. */
function gatheredEvents(): Event[] {
  const events: Event[] = [];
  const take = (game: Game): void => {
    events.push(...game.eventsSince(0, 'omniscient').map(([, event]) => event));
    game.dispose();
  };
  for (let seed = 1; seed <= 16; seed++) {
    take(finishedGame(seed.toString(16).padStart(64, '0'), new Xorshift(seed)));
  }

  const rng = new Xorshift(99);
  const played = Game.create('ab'.repeat(32), defaultRulesConfig());
  while (played.roundBoundary() === null) {
    const seat = rng.pick(played.pending().seats);
    played.apply(seat, rng.pick(played.legalActions(seat)));
  }
  const boundary = played.roundBoundary()!;
  const resumed = Game.resume(boundary, played.replay(), 'cd'.repeat(32));
  played.dispose();
  for (let i = 0; i < 20_000 && !isOver(resumed.view('omniscient')); i++) {
    const seat = rng.pick(resumed.pending().seats);
    resumed.apply(seat, i === 40 ? 'resign' : rng.pick(resumed.legalActions(seat)));
  }
  take(resumed);
  return events;
}

describe('event text', () => {
  let events: Event[] = [];
  beforeAll(() => {
    events = gatheredEvents();
  });

  it('is generated from games that cover every event kind', () => {
    expect(new Set(events.map((e) => kindName(e.kind)))).toEqual(new Set(KINDS));
  });

  for (const language of [ENGLISH, GERMAN, JAPANESE]) {
    it(`every event names the right player's characters, markers and subject from every perspective: ${language.locale}`, () => {
      const tr = sentinelTranslator(language);
      const problems = new Set<string>();
      for (const event of events) {
        for (const perspective of ['p0', 'p1', null] as const) {
          for (const problem of ownershipProblems(tr, event, perspective, language)) {
            problems.add(problem);
          }
        }
      }
      expect([...problems]).toEqual([]);
    });
  }

  it('the German check reads an owner named after the character, and only straight after it', () => {
    const read = (text: string) => attributions(text, 'p0', GERMAN_SEATS);
    expect(read('Du triffst mit dem «knight» den «wolfen» deines Gegenübers!')).toEqual({
      found: [
        ['knight', 'p0'],
        ['wolfen', 'p1'],
      ],
      first: 'p0',
    });
    expect(read('Der Angriff deines Gegenübers mit der «seer» geht daneben.').found).toEqual([
      ['seer', 'p1'],
    ]);
    expect(read('Du bekommst 1 «m_cross» von deinem Gegenüber.').found).toEqual([
      ['m_cross', 'p0'],
    ]);
    expect(attributions('Der «seer» von Spieler 2 trifft.', null, GERMAN_SEATS).found).toEqual([
      ['seer', 'p1'],
    ]);
    expect(read('Durch genug «m_fang» gewinnst du.').found).toEqual([['m_fang', null]]);
  });

  it('the Japanese check reads an owner before what it owns, and not a giver named with から', () => {
    const read = (text: string) => attributions(text, 'p0', JAPANESE_SEATS);
    expect(
      read('あなたの«knight»の攻撃が相手の«wolfen»に命中しました！相手の«m_health»が1減りました。'),
    ).toEqual({
      found: [
        ['knight', 'p0'],
        ['wolfen', 'p1'],
        ['m_health', 'p1'],
      ],
      first: 'p0',
    });
    expect(
      attributions('プレイヤー2はプレイヤー1から«m_cross»を1個奪いました。', null, JAPANESE_SEATS)
        .found,
    ).toEqual([['m_cross', 'p1']]);
  });

  it('the ownership check catches a sentence that gives a character to the wrong player', () => {
    const wrong: Translator = {
      t: (id, args) =>
        id === 'event-attack-hit'
          ? `${String(args?.['attacker'])} hits ${String(args?.['character'])}.`
          : sentinelTranslator().t(id, args),
    };
    const hit: Event = {
      visibility: 'public',
      kind: {
        attack_hit: {
          seat: 'p0',
          target_seat: 'p1',
          attacker: 'knight',
          character: 'wolfen',
          health_lost: 1,
        },
      },
    };
    const problems = ownershipProblems(wrong, hit, 'p0');
    expect(problems.filter((problem) => /(knight|wolfen) should be/u.test(problem))).toHaveLength(
      2,
    );
    expect(problems.some((problem) => problem.includes('the health should be p1'))).toBe(true);
    expect(problems.some((problem) => problem.includes('should be about p0'))).toBe(true);
    expect(ownershipProblems(sentinelTranslator(), hit, 'p0')).toEqual([]);
  });

  for (const language of [ENGLISH, GERMAN, JAPANESE]) {
    it(`every event renders as rich text that reads as the plain sentence and bolds every character: ${language.locale}`, () => {
      const l = createLocaliser(language.locale);
      // Each form of each character's name, so that a bold name in any case reads as its character.
      const characterOf = new Map<string, Character>();
      for (const c of CHARACTERS) {
        const id = `character-${c.replaceAll('_', '-')}`;
        for (const key of [id, ...CASES.map((kase) => `${id}.${kase}`)]) {
          const name = l.t(key);
          if (name !== key) characterOf.set(name, c);
        }
      }
      for (const event of events) {
        for (const perspective of ['p0', 'p1', null] as const) {
          const parts = l.richEvent(event, perspective);
          const plain = l.renderEvent(event, perspective);
          expect(plainText(parts)).toBe(plain);
          const emphasised = parts.filter((part) => !('text' in part));
          for (const part of parts) {
            if ('text' in part) expect(part.text, plain).not.toMatch(language.playerText);
            if ('text' in part) expect(part.text, plain).not.toMatch(language.markerWords);
            if ('player' in part) expect(language.playerWords, plain).toContain(part.player);
          }
          const named = facts(event.kind);
          const expected = new Set([...named.owned.map(([c]) => c), ...named.unowned]);
          const marked = new Set(
            emphasised.flatMap((part) =>
              'character' in part ? [characterOf.get(part.character) ?? part.character] : [],
            ),
          );
          expect(marked, plain).toEqual(expected);
          if (perspective === null && language.neutral.test(plain)) {
            expect(
              emphasised.some((part) => 'player' in part),
              plain,
            ).toBe(true);
          }
        }
      }
    });
  }

  it('emphasis follows the arguments when a player is named like a character', () => {
    const real = createLocaliser('en');
    const names: Record<string, string> = { 'seat-p0': 'Knight', 'seat-p1': 'Wolfen' };
    const tr: Translator = { t: (id, args) => names[id] ?? real.t(id, args) };
    const rich = (kind: EventKind): ReturnType<typeof richEvent> =>
      richEvent(tr, list, { visibility: 'public', kind }, null);

    expect(rich({ character_resolved: { seat: 'p0', character: 'knight' } })).toEqual([
      { player: 'Knight' },
      { text: "'s " },
      { character: 'Knight' },
      { text: ' resolves.' },
    ]);
    expect(rich({ hand_dealt: { seat: 'p0', cards: ['hunter', 'knight'] } })).toEqual([
      { player: 'Knight' },
      { text: ' is dealt ' },
      { character: 'Hunter' },
      { text: ', ' },
      { character: 'Knight' },
      { text: '.' },
    ]);
    const revealed = rich({
      plans_revealed: {
        plans: [
          { character: 'knight', targets: [{ character: 'wolfen' }, 'fool'] },
          { character: 'wolfen', targets: [{ character: 'knight' }] },
        ],
        effective: [3, 4],
        order: ['p0', 'p1'],
      },
    });
    expect(plainText(revealed)).toBe(
      'Plans revealed. Knight plays Knight targeting the Wolfen, the Fool at initiative 3. ' +
        'Wolfen plays Wolfen targeting the Knight at initiative 4. Knight resolves first.',
    );
    expect(revealed.filter((part) => !('text' in part))).toEqual([
      { player: 'Knight' },
      { character: 'Knight' },
      { character: 'Wolfen' },
      { player: 'Wolfen' },
      { character: 'Wolfen' },
      { character: 'Knight' },
      { player: 'Knight' },
    ]);
  });

  it('the words that stand for a player are emphasised like a player name', () => {
    const l = createLocaliser('en');
    const hit: Event = {
      visibility: 'public',
      kind: {
        attack_hit: {
          seat: 'p0',
          target_seat: 'p1',
          attacker: 'knight',
          character: 'wolfen',
          health_lost: 1,
        },
      },
    };
    expect(l.richEvent(hit, 'p0')).toEqual([
      { player: 'Your' },
      { text: ' ' },
      { character: 'Knight' },
      { text: ' hits ' },
      { player: 'your opponent' },
      { text: "'s " },
      { character: 'Wolfen' },
      { text: '! ' },
      { player: 'Your opponent' },
      { text: ' loses 1 ' },
      { marker: 'health', label: 'Health' },
      { text: '.' },
    ]);
    const missed: Event = {
      visibility: 'public',
      kind: { attack_missed: { seat: 'p1', attacker: 'seer' } },
    };
    expect(l.richEvent(missed, 'p0')).toEqual([
      { player: 'Your opponent' },
      { text: "'s " },
      { character: 'Seer' },
      { text: ' misses.' },
    ]);
  });
});
