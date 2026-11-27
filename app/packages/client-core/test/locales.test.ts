import { readFileSync } from 'node:fs';
import { FluentResource, type Message } from '@fluent/bundle';
import { beforeAll, describe, expect, it } from 'vitest';
import { engineFtl, loadEngineFtl, type Character, type Event } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import {
  createLocaliser,
  loadLocale,
  LOCALES,
  type Locale,
  type Localiser,
  type MessageArgs,
} from '../src/index.js';
import { ARTICLES, CASES, GENDERS } from '../src/grammar.js';
import { localiserFromSources } from '../src/i18n.js';
import { loadUiFtl, uiFtl } from '../src/generated/ui-ftl.js';
import { pseudoLocaliser, pseudoResource } from '../src/pseudo.js';
import { Xorshift, finishedGame } from './helpers.js';

beforeAll(async () => {
  await loadEngineForNode();
  await Promise.all(LOCALES.map(loadLocale));
});

type Pattern = NonNullable<Message['value']>;
type Element = Exclude<Pattern, string>[number];
type Expression = Exclude<Element, string>;
interface Entry {
  value: Pattern | null;
  attributes: Record<string, Pattern>;
}

/** Locales whose text is still the English placeholder, so the translated checks skip them. */
const UNTRANSLATED: ReadonlySet<Locale> = new Set<Locale>([]);

/** Messages and terms that read the same in every language, such as names. */
const SAME_IN_EVERY_LANGUAGE: ReadonlySet<string> = new Set([
  '-game-name',
  '-author',
  '-publisher',
  'app-title',
  // Words that German shares with English.
  'settings-language-system',
  'settings-theme-system',
  'settings-motion-system',
  'settings-server',
  'settings-data-backup',
  'about-version',
  'table-status',
  'phase-step-plan',
  'plan-status-revealed',
  'plan-summary',
  'side-initiative',
  'side-initiative-changed',
  'side-initiative-hidden',
  'side-label',
  'play-online',
  'continue-pin',
  'rejoin-pin-label',
  'pause-heading',
]);

/** The words for a player that every event message is given, whichever it uses. */
const PLAYER_WORDS = [
  'youCap',
  'you',
  'yourCap',
  'your',
  'opponentCap',
  'opponent',
  'youDat',
  'yourAccMasculine',
  'yourAccFeminine',
  'opponentDat',
  'opponentGen',
];

/** Arguments a message is given that the English text has no need for. */
const EXTRA_ARGUMENTS: Readonly<Record<string, readonly string[]>> = {
  'grammar-character-form': ['name', 'case', 'article', 'gender'],
  'target-fool': ['case', 'article'],
  'plan-summary-fool': ['case', 'article'],
  'game-over-how': ['result'],
};

/** Messages whose character list takes the form their `.list-case` and `.list-article` give. */
const LIST_MESSAGES: ReadonlySet<string> = new Set([
  'event-hand-dealt',
  'plan-targeting',
  'cli-your-hand',
  'describe-hand',
  'plan-summary-short',
]);
const LIST_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  'list-case': CASES,
  'list-article': ARTICLES,
};
const CHARACTER_ATTRIBUTES = ['gender', ...CASES];
/** The named options of `CHARACTER` and the values each takes. */
const CHARACTER_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  case: CASES,
  article: ARTICLES,
};
/** Attributes whose value is a keyword, and the keywords each may take. */
const KEYWORD_VALUES: Readonly<Record<string, readonly string[]>> = {
  gender: GENDERS,
  'list-case': CASES,
  'list-article': ARTICLES,
};

/** The grammar a locale's files must give beyond what English has. */
interface RequiredForms {
  /** The attributes every character message needs. */
  readonly characterAttributes: readonly string[];
  /** The arguments `grammar-character-form` must use to place the article. */
  readonly formVariables: readonly string[];
}

/** The grammar each translated locale must give; a locale on the untranslated list is exempt. */
const REQUIRED_FORMS: Partial<Record<Locale, RequiredForms>> = {
  de: {
    characterAttributes: ['gender', ...CASES],
    formVariables: ['name', 'case', 'article', 'gender'],
  },
};

const requiredFor = (locale: Locale): RequiredForms | undefined =>
  UNTRANSLATED.has(locale) ? undefined : REQUIRED_FORMS[locale];

/** Arguments named so that the code always passes a number. */
const NUMBER_ARGUMENTS: ReadonlySet<string> = new Set([
  'n',
  'count',
  'round',
  'rounds',
  'next',
  'number',
  'added',
  'updated',
  'games',
  'wins0',
  'wins1',
  'won',
  'lost',
  'total',
  'index',
  'segment',
  'step',
  'line',
  'placed',
  'initiative',
  'effective',
  'printed',
  'actorInitiative',
  'otherInitiative',
  'percent',
  'minutes',
  'seconds',
]);
/** Arguments named so that the code always passes text: names, words, ids and selector values. */
const TEXT_ARGUMENTS: ReadonlySet<string> = new Set([
  // Seats, as selector values, and the display names that go with them.
  'actor',
  'actorName',
  'other',
  'otherName',
  'first',
  'firstName',
  'second',
  'victim',
  'victimName',
  'targetSeat',
  'targetSeatName',
  'seat',
  'player',
  'owner',
  'winner',
  'loser',
  'who',
  'host',
  'name',
  // Marker names, and the markers' ids for a message to select on.
  'badge',
  'cross',
  'crosses',
  'fang',
  'fangs',
  'health',
  'hourglass',
  'hourglasses',
  'potion',
  'marker',
  'markerId',
  'markers',
  // Characters, factions and plans already put into words.
  'character',
  'cards',
  'targets',
  'plan',
  'target',
  'label',
  'actorPlan',
  'otherPlan',
  'faction',
  'ability',
  // Selector values.
  'reason',
  'result',
  'source',
  'status',
  'rule',
  // Other text.
  'code',
  'command',
  'commitment',
  'credit',
  'date',
  'detail',
  'example',
  'hash',
  'language',
  'licence',
  'link',
  'meta',
  'path',
  'pin',
  'room',
  'seed',
  'summary',
  'time',
  'version',
  'when',
]);
/** Messages given numbers under names that other messages use for words. */
const NUMBER_ARGUMENTS_OF: Readonly<Record<string, readonly string[]>> = {
  'cli-your-markers': ['health', 'cross', 'fang', 'hourglass'],
  'cli-opponent-markers': ['health', 'cross', 'fang', 'hourglass'],
};
/** Values like the ones the code gives the grammar arguments. */
const SAMPLE_ARGUMENTS: Readonly<Record<string, string>> = {
  case: 'acc',
  article: 'def',
  gender: 'masculine',
};

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

const FILES = {
  engine: (locale: string) =>
    new URL(`../../../../engine/locales/${locale}/engine.ftl`, import.meta.url),
  ui: (locale: string) => new URL(`../locales/${locale}/ui.ftl`, import.meta.url),
} as const;
type File = keyof typeof FILES;

const source = (locale: string, file: File): string => readFileSync(FILES[file](locale), 'utf8');

function entriesOf(resource: FluentResource): Map<string, Entry> {
  return new Map(resource.body.map((entry) => [entry.id, entry]));
}

const entries = (locale: string, file: File): Map<string, Entry> =>
  entriesOf(new FluentResource(source(locale, file)));

/** Every expression in `pattern`, nested ones included. */
function* expressions(pattern: Pattern | null | undefined): Generator<Expression> {
  if (pattern === null || pattern === undefined || typeof pattern === 'string') return;
  for (const element of pattern) if (typeof element !== 'string') yield* within(element);
}

function* within(expression: Expression): Generator<Expression> {
  yield expression;
  if (expression.type === 'select') {
    yield* within(expression.selector);
    for (const variant of expression.variants) yield* expressions(variant.value);
  }
  if (expression.type === 'func' || expression.type === 'term') {
    for (const arg of expression.args) if (arg.type !== 'narg') yield* within(arg);
  }
}

/** The text of `pattern`, in all its variants. */
function texts(pattern: Pattern | null | undefined): string[] {
  if (pattern === null || pattern === undefined) return [];
  if (typeof pattern === 'string') return [pattern];
  return pattern.flatMap((element) =>
    typeof element === 'string'
      ? [element]
      : [...within(element)].flatMap((e) =>
          e.type === 'select' ? e.variants.flatMap((v) => texts(v.value)) : [],
        ),
  );
}

const variables = (pattern: Pattern | null | undefined): Set<string> =>
  new Set([...expressions(pattern)].flatMap((e) => (e.type === 'var' ? [e.name] : [])));

/** The variables a message's value and attributes select on as a count. */
function countVariables(entry: Entry): Set<string> {
  const counts = new Set<string>();
  for (const pattern of [entry.value, ...Object.values(entry.attributes)]) {
    for (const e of expressions(pattern)) {
      if (e.type !== 'select' || e.selector.type !== 'var') continue;
      const plural = e.variants.some(
        (v) => v.key.type === 'num' || ['zero', 'one', 'two', 'few', 'many'].includes(v.key.value),
      );
      if (plural) counts.add(e.selector.name);
    }
  }
  return counts;
}

/** The variables a pattern names characters by, as `CHARACTER` and `GENDER` take them. */
function characterVariables(entry: Entry): Set<string> {
  const names = new Set<string>();
  for (const pattern of [entry.value, ...Object.values(entry.attributes)]) {
    for (const e of expressions(pattern)) {
      if (e.type !== 'func' || (e.name !== 'CHARACTER' && e.name !== 'GENDER')) continue;
      for (const arg of e.args) if (arg.type === 'var') names.add(arg.name);
    }
  }
  return names;
}

/** What is wrong with a call of a grammar function, if anything. */
function callProblems(id: string, pattern: Pattern | null | undefined): string[] {
  const problems: string[] = [];
  for (const e of expressions(pattern)) {
    if (e.type !== 'func' || e.name === 'NUMBER' || e.name === 'DATETIME') continue;
    const positional = e.args.filter((arg) => arg.type !== 'narg');
    const named = e.args.flatMap((arg) => (arg.type === 'narg' ? [arg] : []));
    if (e.name !== 'CHARACTER' && e.name !== 'GENDER') {
      problems.push(`${id}: unknown function ${e.name}`);
      continue;
    }
    if (positional.length !== 1 || positional[0]?.type !== 'var') {
      problems.push(`${id}: ${e.name} takes one character variable`);
    }
    for (const arg of named) {
      const allowed = e.name === 'CHARACTER' ? CHARACTER_OPTIONS[arg.name] : undefined;
      if (allowed === undefined) problems.push(`${id}: ${e.name} has no option ${arg.name}`);
      else if (!allowed.includes(String(arg.value.value)))
        problems.push(`${id}: ${e.name} has no ${arg.name} ${String(arg.value.value)}`);
    }
  }
  return problems;
}

/** The variables `pattern` uses that a message given `allowed` cannot have. */
function unknownVariables(id: string, pattern: Pattern | null, allowed: Set<string>): string[] {
  const playerWords = id.startsWith('event-') || PLAYER_WORDS.some((word) => allowed.has(word));
  return [...variables(pattern)]
    .filter((name) => !allowed.has(name) && !(playerWords && PLAYER_WORDS.includes(name)))
    .map((name) => `${id}: unknown variable $${name}`);
}

/**
 * How a locale's messages, `translated`, differ in shape from the English ones, and what grammar
 * they lack that `required` asks for.
 */
function structureProblems(
  english: Map<string, Entry>,
  translated: Map<string, Entry>,
  required?: RequiredForms,
): string[] {
  const problems: string[] = [];
  for (const id of english.keys()) if (!translated.has(id)) problems.push(`${id} is missing`);
  for (const [id, entry] of translated) {
    const original = english.get(id);
    if (original === undefined) {
      problems.push(`${id} is not an English message`);
      continue;
    }
    if ((original.value === null) !== (entry.value === null)) problems.push(`${id}: value`);
    const given = new Set([...variables(original.value), ...(EXTRA_ARGUMENTS[id] ?? [])]);
    problems.push(...unknownVariables(id, entry.value, given));
    for (const name of variables(original.value)) {
      if (!variables(entry.value).has(name) && !PLAYER_WORDS.includes(name))
        problems.push(`${id}: $${name} is missing`);
    }
    problems.push(...callProblems(id, entry.value));
    for (const name of Object.keys(original.attributes)) {
      if (!(name in entry.attributes)) problems.push(`${id}.${name} is missing`);
    }
    for (const [name, pattern] of Object.entries(entry.attributes)) {
      const where = `${id}.${name}`;
      problems.push(...callProblems(where, pattern));
      problems.push(...unknownVariables(where, pattern, variables(original.attributes[name])));
      const values = KEYWORD_VALUES[name];
      if (values !== undefined && !(typeof pattern === 'string' && values.includes(pattern)))
        problems.push(`${where} = ${JSON.stringify(pattern)} is not one of ${values.join(', ')}`);
      if (name in original.attributes) continue;
      const known =
        (LIST_MESSAGES.has(id) && name in LIST_ATTRIBUTES) ||
        (id.startsWith('character-') && CHARACTER_ATTRIBUTES.includes(name));
      if (!known) problems.push(`${where} is not an attribute it may have`);
    }
  }
  if (required !== undefined) problems.push(...requiredFormProblems(english, translated, required));
  return problems;
}

/** The grammar `required` asks for that the locale's character and form messages lack. */
function requiredFormProblems(
  english: Map<string, Entry>,
  translated: Map<string, Entry>,
  required: RequiredForms,
): string[] {
  const problems: string[] = [];
  for (const [id, entry] of translated) {
    if (!english.has(id)) continue;
    if (id.startsWith('character-')) {
      for (const name of required.characterAttributes) {
        if (!(name in entry.attributes)) problems.push(`${id}.${name} is required`);
      }
    }
    if (id === 'grammar-character-form') {
      for (const name of required.formVariables) {
        if (!variables(entry.value).has(name)) problems.push(`${id}: $${name} is required`);
      }
    }
  }
  return problems;
}

/** The arguments of message `id` to format it with, given `n` for each number. */
function sampleArguments(id: string, patterns: Array<Pattern | null>, n: number): MessageArgs {
  const entry = (value: Pattern | null): Entry => ({ value, attributes: {} });
  const counts = new Set([
    ...(NUMBER_ARGUMENTS_OF[id] ?? []),
    ...patterns.flatMap((p) => [...countVariables(entry(p))]),
  ]);
  const characters = new Set(patterns.flatMap((p) => [...characterVariables(entry(p))]));
  const names = new Set([
    ...patterns.flatMap((p) => [...variables(p)]),
    ...(EXTRA_ARGUMENTS[id] ?? []),
  ]);
  return Object.fromEntries(
    [...names].map((name) => [
      name,
      counts.has(name) || NUMBER_ARGUMENTS.has(name)
        ? n
        : characters.has(name)
          ? 'hunter'
          : (SAMPLE_ARGUMENTS[name] ?? 'x'),
    ]),
  );
}

/**
 * The messages of `translated` that `l` cannot format with sample arguments, every number in
 * them given 0, 1, 2 and 5; the English messages say which arguments the code gives.
 */
function formatProblems(
  l: Localiser,
  english: Map<string, Entry>,
  translated: Map<string, Entry>,
): string[] {
  const problems: string[] = [];
  for (const [id, entry] of translated) {
    if (id.startsWith('-')) continue;
    const original = english.get(id);
    const keys = [
      ...(entry.value === null ? [] : [null]),
      ...Object.keys(entry.attributes).filter((name) => !(name in KEYWORD_VALUES)),
    ];
    for (const attribute of keys) {
      const key = attribute === null ? id : `${id}.${attribute}`;
      const pick = (e: Entry | undefined) =>
        e === undefined ? null : attribute === null ? e.value : (e.attributes[attribute] ?? null);
      const patterns = [pick(entry), pick(original)];
      for (const n of [0, 1, 2, 5]) {
        const text = l.t(key, sampleArguments(id, patterns, n));
        if (text === key || /[{}]/.test(text))
          problems.push(`${key} cannot be formatted with ${n}`);
      }
    }
  }
  return problems;
}

const FORMAT_LOCALES = { en: 'en-GB', de: 'de-DE', ja: 'ja-JP' } as const;

const fixture = (name: string): string =>
  readFileSync(
    new URL(`../../../../engine/crates/wwd-cli/tests/fixtures/${name}.ftl`, import.meta.url),
    'utf8',
  );

describe('locales', () => {
  it('offers English, German and Japanese, formatted in their own locales', async () => {
    expect(LOCALES).toEqual(['en', 'de', 'ja']);
    expect(LOCALES.map((locale) => createLocaliser(locale).locale)).toEqual([
      'en-GB',
      'de-DE',
      'ja-JP',
    ]);
    for (const locale of LOCALES) {
      expect(await loadEngineFtl(locale), locale).toBe(source(locale, 'engine'));
      expect(await loadUiFtl(locale), locale).toBe(source(locale, 'ui'));
    }
    expect(engineFtl['en']).toBe(source('en', 'engine'));
    expect(uiFtl['en']).toBe(source('en', 'ui'));
  });

  it('formats lists in the language of the locale', () => {
    const event: Event = {
      visibility: 'public',
      kind: { hand_dealt: { seat: 'p0', cards: ['hunter', 'knight', 'seer'] } },
    };
    const german = localiserFromSources('en', 'de-DE', [engineFtl['en']!, uiFtl['en']!]);
    expect(german.renderEvent(event, null)).toBe('Player 1 is dealt Hunter, Knight und Seer.');
  });

  for (const locale of LOCALES) {
    it(`every locale has every message with the same placeholders: ${locale}`, () => {
      for (const file of Object.keys(FILES) as File[]) {
        const problems = structureProblems(
          entries('en', file),
          entries(locale, file),
          requiredFor(locale),
        );
        expect(problems, `${locale} ${file}`).toEqual([]);
      }
    });
  }

  it('German needs a gender and every case form once it is translated', () => {
    expect(REQUIRED_FORMS.de?.characterAttributes).toEqual(['gender', 'nom', 'acc', 'dat', 'gen']);
    expect(requiredFor('de')).toBe(UNTRANSLATED.has('de') ? undefined : REQUIRED_FORMS.de);
    expect(requiredFor('ja')).toBeUndefined();
    expect(requiredFor('en')).toBeUndefined();
  });

  it('the allow-list of untranslated locales names only locales still to translate', () => {
    for (const locale of UNTRANSLATED) expect(LOCALES.filter((l) => l !== 'en')).toContain(locale);
  });

  for (const locale of LOCALES.filter((l) => l !== 'en')) {
    it.skipIf(UNTRANSLATED.has(locale))(`every message is translated: ${locale}`, () => {
      for (const file of Object.keys(FILES) as File[]) {
        const english = entries('en', file);
        for (const [id, entry] of entries(locale, file)) {
          const original = texts(english.get(id)?.value).join('');
          if (SAME_IN_EVERY_LANGUAGE.has(id) || !/\p{L}/u.test(original)) continue;
          expect(texts(entry.value).join(''), `${locale} ${id}`).not.toBe(original);
        }
      }
    });
  }

  it('every message formats, with every count at 0, 1, 2 and 5, in every locale', () => {
    for (const locale of LOCALES) {
      const l = createLocaliser(locale);
      for (const file of Object.keys(FILES) as File[]) {
        const problems = formatProblems(l, entries('en', file), entries(locale, file));
        expect(problems, `${locale} ${file}`).toEqual([]);
      }
    }
  });

  it('the sweep counts every number argument, selected on or not', () => {
    const english = entries('en', 'ui');
    const numbered = [...english].filter(([id, entry]) =>
      Object.values(sampleArguments(id, [entry.value], 5)).includes(5),
    );
    const ids = numbered.map(([id]) => id);
    for (const id of [
      'count-cross',
      'count-fang',
      'count-hand',
      'stats-games',
      'plan-status-hidden',
    ])
      expect(ids).toContain(id);
    expect(
      sampleArguments(
        'cli-your-markers',
        [entries('en', 'engine').get('cli-your-markers')!.value],
        2,
      ),
    ).toMatchObject({ health: 2, cross: 2, fang: 2, hourglass: 2 });
  });

  it('every argument of an English message is listed as a number or as text', () => {
    const problems: string[] = [];
    for (const file of Object.keys(FILES) as File[]) {
      for (const [id, entry] of entries('en', file)) {
        const patterns = [entry.value, ...Object.values(entry.attributes)];
        const counted = countVariables(entry);
        const characters = characterVariables(entry);
        for (const name of new Set(patterns.flatMap((p) => [...variables(p)]))) {
          if ((NUMBER_ARGUMENTS_OF[id] ?? []).includes(name)) continue;
          const number = NUMBER_ARGUMENTS.has(name) || counted.has(name);
          const text =
            TEXT_ARGUMENTS.has(name) || characters.has(name) || PLAYER_WORDS.includes(name);
          if (number && text) problems.push(`${file} ${id}: $${name} is listed as both`);
          if (!number && !text) problems.push(`${file} ${id}: $${name} is not listed`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('Japanese counts markers with 個', () => {
    const markers = '(?:砂時計|十字架|牙|薬|バッジ)';
    const count = '(?:\\d+|\\{ \\$\\w+ \\})つ';
    // A marker and a つ count within a few characters of each other, in either order.
    const near = '[^、。\\s]{0,3}?';
    const counted = new RegExp(`${markers}${near}${count}|${count}${near}${markers}`, 'gu');
    const found = (text: string): string[] => [...text.matchAll(counted)].map((match) => match[0]);
    expect(found('砂時計を1つ置く')).toHaveLength(1);
    expect(found('{ $n }つの砂時計')).toHaveLength(1);
    expect(found('砂時計1つ')).toHaveLength(1);
    expect(found('砂時計を1個置く、1つずつ')).toEqual([]);
    expect((Object.keys(FILES) as File[]).flatMap((file) => found(source('ja', file)))).toEqual([]);
  });

  it('every character resolves in every case and article in every locale', () => {
    for (const locale of LOCALES) {
      const l = localiserFromSources(
        locale,
        FORMAT_LOCALES[locale],
        [source(locale, 'engine'), source(locale, 'ui')],
        [fixture('probes')],
      );
      for (const c of CHARACTERS) {
        for (const article of ARTICLES) {
          for (const kase of CASES) {
            const id = `probe-${article}-${kase}`;
            const text = l.t(id, { c });
            expect(text, `${locale} ${c} ${kase} ${article}`).not.toBe(id);
            expect(text, `${locale} ${c} ${kase} ${article}`).not.toBe('[]');
          }
        }
        expect(l.t('probe-gender', { c }), `${locale} ${c} gender`).not.toBe('probe-gender');
      }
    }
  });

  it('every German character resolves in every case and article', () => {
    const l = localiserFromSources(
      'de',
      'de-DE',
      [source('de', 'engine'), source('de', 'ui')],
      [fixture('probes')],
    );
    const forms = (c: string): string[] =>
      ARTICLES.flatMap((article) =>
        CASES.map((kase) => l.t(`probe-${article}-${kase}`, { c }).slice(1, -1)),
      );
    const masculine = (name: string, genitive: string): string[] => [
      `der ${name}`,
      `den ${name}`,
      `dem ${name}`,
      `des ${genitive}`,
      `ein ${name}`,
      `einen ${name}`,
      `einem ${name}`,
      `eines ${genitive}`,
      name,
      name,
      name,
      genitive,
    ];
    const feminine = (name: string): string[] => [
      `die ${name}`,
      `die ${name}`,
      `der ${name}`,
      `der ${name}`,
      `eine ${name}`,
      `eine ${name}`,
      `einer ${name}`,
      `einer ${name}`,
      name,
      name,
      name,
      name,
    ];
    expect(Object.fromEntries(CHARACTERS.map((c) => [c, forms(c)]))).toEqual({
      hunter: masculine('Jäger', 'Jägers'),
      wolf_king: masculine('Werwolfkönig', 'Werwolfkönigs'),
      knight: masculine('Ritter', 'Ritters'),
      wolfen: masculine('Jungwolf', 'Jungwolfs'),
      seer: feminine('Seherin'),
      witch: feminine('Hexe'),
      wolf_beauty: feminine('Wolfsschönheit'),
      villager: masculine('Dorfbewohner', 'Dorfbewohners'),
    });
    const fool = ARTICLES.flatMap((article) =>
      CASES.map((kase) => l.t('target-fool', { case: kase, article })),
    );
    expect(fool).toEqual([
      'der Narr',
      'den Narren',
      'dem Narren',
      'des Narren',
      'ein Narr',
      'einen Narren',
      'einem Narren',
      'eines Narren',
      'Narr',
      'Narren',
      'Narren',
      'Narren',
    ]);
  });
});

const FIXTURE_ENGLISH = `
character-hunter = Hunter
character-witch = Witch
grammar-character-form = { $name }
faction-human = Human
count-fang = Fangs: { $n }
count-held = Fangs held: { $held }
event-hand-dealt = { $actorName } is dealt { $cards }.
probe = [{ CHARACTER($c) }]
`;

const FIXTURE_GERMAN = `
character-hunter = Jäger
    .gender = masculine
    .nom = Jäger
    .acc = Jäger
    .dat = Jäger
    .gen = Jägers
character-witch = Hexe
    .gender = feminine
    .nom = Hexe
    .acc = Hexe
    .dat = Hexe
    .gen = Hexe
grammar-character-form = { $case ->
       *[nom] { $article ->
            [def] { $gender ->
                [masculine] der
               *[other] die
            } { $name }
           *[none] { $name }
        }
    }
faction-human = Mensch
count-fang = Reißzähne: { $n }
count-held = Gehaltene Reißzähne: { $held }
event-hand-dealt = { $actorName } bekommt { $cards }.
    .list-case = acc
    .list-article = def
probe = [{ CHARACTER($c, case: "acc", article: "def") }]
`;

const parse = (source: string): Map<string, Entry> => entriesOf(new FluentResource(source));

/** The completeness problems of the German fixture after `edit`, with or without German's required grammar. */
function fixtureProblems(edit: (german: string) => string, needsGrammar = true): string[] {
  const german = edit(FIXTURE_GERMAN);
  expect(german, 'the edit changes the fixture').not.toBe(FIXTURE_GERMAN);
  return structureProblems(
    parse(FIXTURE_ENGLISH),
    parse(german),
    needsGrammar ? REQUIRED_FORMS.de : undefined,
  );
}

/** The formatting problems of the German fixture after `edit`. */
function fixtureFormatProblems(edit: (german: string) => string): string[] {
  const german = edit(FIXTURE_GERMAN);
  const l = localiserFromSources('de', 'de-DE', [german]);
  return formatProblems(l, parse(FIXTURE_ENGLISH), parse(german));
}

describe('the completeness check', () => {
  it('passes a complete German fixture', () => {
    const english = parse(FIXTURE_ENGLISH);
    const german = parse(FIXTURE_GERMAN);
    expect(structureProblems(english, german, REQUIRED_FORMS.de)).toEqual([]);
    expect(structureProblems(english, english)).toEqual([]);
    const l = localiserFromSources('de', 'de-DE', [FIXTURE_GERMAN]);
    expect(formatProblems(l, english, german)).toEqual([]);
  });

  it('reports a missing id', () => {
    expect(fixtureProblems((de) => de.replace('faction-human = Mensch\n', ''))).toEqual([
      'faction-human is missing',
    ]);
  });

  it('reports an extra id', () => {
    expect(fixtureProblems((de) => `${de}extra = Mehr\n`)).toEqual([
      'extra is not an English message',
    ]);
  });

  it('reports a renamed or dropped placeholder', () => {
    expect(fixtureProblems((de) => de.replace('{ $n }', '{ $anzahl }'))).toEqual([
      'count-fang: unknown variable $anzahl',
      'count-fang: $n is missing',
    ]);
    expect(fixtureProblems((de) => de.replace('Reißzähne: { $n }', 'Reißzähne'))).toEqual([
      'count-fang: $n is missing',
    ]);
  });

  it('reports a list case or article that is not a keyword', () => {
    expect(fixtureProblems((de) => de.replace('.list-case = acc', '.list-case = akk'))).toEqual([
      'event-hand-dealt.list-case = "akk" is not one of nom, acc, dat, gen',
    ]);
    expect(
      fixtureProblems((de) => de.replace('.list-article = def', '.list-article = bestimmt')),
    ).toEqual(['event-hand-dealt.list-article = "bestimmt" is not one of def, indef, none']);
  });

  it('reports a list attribute on a message without a list', () => {
    expect(
      fixtureProblems((de) =>
        de.replace('faction-human = Mensch', 'faction-human = Mensch\n    .list-case = acc'),
      ),
    ).toEqual(['faction-human.list-case is not an attribute it may have']);
  });

  it('reports an unknown variable in an attribute', () => {
    expect(fixtureProblems((de) => de.replace('.acc = Hexe', '.acc = { $name }'))).toEqual([
      'character-witch.acc: unknown variable $name',
    ]);
  });

  it('reports a gender that is not a keyword', () => {
    expect(fixtureProblems((de) => de.replace('.gender = feminine', '.gender = weiblich'))).toEqual(
      ['character-witch.gender = "weiblich" is not one of masculine, feminine, neuter'],
    );
  });

  it('reports a grammar function called with a bad option or without a variable', () => {
    expect(fixtureProblems((de) => de.replace('case: "acc"', 'case: "akk"'))).toEqual([
      'probe: CHARACTER has no case akk',
    ]);
    expect(
      fixtureProblems((de) =>
        de.replace('CHARACTER($c, case: "acc", article: "def")', 'GENDER($c, case: "acc")'),
      ),
    ).toEqual(['probe: GENDER has no option case']);
    expect(
      fixtureProblems((de) =>
        de.replace('CHARACTER($c, case: "acc", article: "def")', 'CHARACTER("hunter")'),
      ),
    ).toEqual(['probe: $c is missing', 'probe: CHARACTER takes one character variable']);
  });

  it('reports a missing gender or case form only where the locale needs them', () => {
    const noGender = (de: string) => de.replace('    .gender = feminine\n', '');
    expect(fixtureProblems(noGender)).toEqual(['character-witch.gender is required']);
    expect(fixtureProblems((de) => de.replace('    .gen = Jägers\n', ''))).toEqual([
      'character-hunter.gen is required',
    ]);
    expect(fixtureProblems(noGender, false)).toEqual([]);
    expect(
      fixtureProblems((de) =>
        de.replace('[masculine] der', '[masculine] {"der"}').replace('{ $gender ->', '{ "x" ->'),
      ),
    ).toEqual(['grammar-character-form: $gender is required']);
  });

  it('reports a translation whose own count or reference cannot be formatted', () => {
    // `held` is on neither list, so only the translation's own plural makes it a count.
    expect(NUMBER_ARGUMENTS.has('held') || TEXT_ARGUMENTS.has('held')).toBe(false);
    const plural = (de: string) =>
      de.replace(
        'count-held = Gehaltene Reißzähne: { $held }',
        'count-held = { $held ->\n        [one] 1 Reißzahn\n       *[other] { $held } { -reisszaehne }\n    }',
      );
    expect(fixtureFormatProblems(plural)).toEqual([
      'count-held cannot be formatted with 0',
      'count-held cannot be formatted with 2',
      'count-held cannot be formatted with 5',
    ]);
    expect(
      fixtureFormatProblems((de) =>
        de.replace('faction-human = Mensch', 'faction-human = { -mensch }'),
      ),
    ).toEqual([0, 1, 2, 5].map((n) => `faction-human cannot be formatted with ${n}`));
  });
});

describe('pseudo-locale', () => {
  it('pads with short words of its own, so a line can still break where English would', () => {
    const pseudo = pseudoLocaliser();
    for (const id of ['settings-data-note', 'back', 'stats-col-succeeded']) {
      const text = pseudo.t(id);
      expect(text, id).toMatch(/ ~/);
      expect(text, id).not.toMatch(/~{5}/);
      expect(text, id).not.toMatch(/\p{L}~/u);
    }
  });

  it('the pseudo-locale lengthens every message by about 30 % and keeps placeholders', () => {
    const english = createLocaliser('en');
    const pseudo = pseudoLocaliser();
    let measured = 0;
    for (const file of Object.keys(FILES) as File[]) {
      const original = entries('en', file);
      const lengthened = entriesOf(pseudoResource(source('en', file)));
      expect([...lengthened.keys()]).toEqual([...original.keys()]);
      for (const [id, entry] of original) {
        const pseudoEntry = lengthened.get(id)!;
        expect(variables(pseudoEntry.value), id).toEqual(variables(entry.value));
        expect(Object.keys(pseudoEntry.attributes), id).toEqual(Object.keys(entry.attributes));
        if (id.startsWith('-') || variables(entry.value).size > 0 || entry.value === null) continue;
        const text = english.t(id);
        if (text.replace(/\P{L}/gu, '').length < 8) continue;
        const ratio = pseudo.t(id).length / text.length;
        expect(ratio, `${id}: ${pseudo.t(id)}`).toBeGreaterThanOrEqual(1.2);
        expect(ratio, `${id}: ${pseudo.t(id)}`).toBeLessThanOrEqual(1.5);
        expect(pseudo.t(id), id).not.toBe(text);
        measured += 1;
      }
    }
    expect(measured).toBeGreaterThan(100);
  });

  it('keeps the grammar attributes and formats every event', () => {
    const resource = pseudoResource(
      'character-x = Name\n    .gender = feminine\nm = { $cards }\n    .list-case = acc\n    .list-article = def\n',
    );
    const [character, message] = resource.body;
    expect(character?.attributes['gender']).toBe('feminine');
    expect(message?.attributes['list-case']).toBe('acc');
    expect(message?.attributes['list-article']).toBe('def');
    const pseudo = pseudoLocaliser();
    for (let seed = 1; seed <= 4; seed++) {
      const game = finishedGame(seed.toString(16).padStart(64, '0'), new Xorshift(seed));
      for (const [, event] of game.eventsSince(0, 'omniscient')) {
        for (const perspective of ['p0', 'p1', null] as const) {
          const text = pseudo.renderEvent(event, perspective);
          expect(text, JSON.stringify(event.kind)).not.toMatch(/^event-|[{}$]|undefined/);
        }
      }
      game.dispose();
    }
  });

  it('is not a language players can choose', () => {
    expect(LOCALES).not.toContain('pseudo');
    expect(() => createLocaliser('pseudo' as Locale)).toThrow();
  });
});
