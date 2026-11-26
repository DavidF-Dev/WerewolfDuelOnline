import { FluentResource, type Message } from '@fluent/bundle';
import { engineFtl } from '@wwd/engine';
import { uiFtl } from './generated/ui-ftl.js';
import { localiserFromSources, type Localiser } from './i18n.js';

type Pattern = NonNullable<Message['value']>;
type Element = Exclude<Pattern, string>[number];
type Expression = Exclude<Element, string>;

const ACCENTS: Readonly<Record<string, string>> = {
  a: 'á',
  c: 'ç',
  e: 'é',
  i: 'í',
  n: 'ñ',
  o: 'ó',
  s: 'š',
  u: 'ú',
  y: 'ý',
  z: 'ž',
  A: 'Á',
  C: 'Ç',
  E: 'É',
  I: 'Í',
  N: 'Ñ',
  O: 'Ó',
  S: 'Š',
  U: 'Ú',
  Y: 'Ý',
  Z: 'Ž',
};

/** Attributes whose values the code reads as keywords, not as text to show. */
const KEYWORD_ATTRIBUTES: ReadonlySet<string> = new Set(['gender', 'list-case', 'list-article']);

/**
 * `text` with accented letters and about 30 % more characters, as padding before any trailing
 * space. The padding is a run of short `~` words after the text, so the text's own words keep
 * their length and a line breaks no later than English would.
 */
function lengthen(text: string): string {
  const accented = Array.from(text, (ch) => ACCENTS[ch] ?? ch).join('');
  if (!/\p{L}/u.test(text)) return accented;
  const length = Math.max(Math.ceil(text.trim().length * 0.3), 2);
  const padding = ` ${'~~~~ '.repeat(length)}`.slice(0, length).trimEnd();
  return accented.replace(/\s*$/u, (space) => padding + space);
}

function lengthenPattern(pattern: Pattern): Pattern {
  if (typeof pattern === 'string') return lengthen(pattern);
  return pattern.map((element) =>
    typeof element === 'string' ? lengthen(element) : lengthenExpression(element),
  );
}

function lengthenExpression(expression: Expression): Expression {
  if (expression.type !== 'select') return expression;
  return {
    ...expression,
    variants: expression.variants.map((variant) => ({
      ...variant,
      value: lengthenPattern(variant.value),
    })),
  };
}

/**
 * The messages of `source` with every text lengthened by about 30 % and its letters accented,
 * keeping placeholders, selectors and keyword attributes as they are.
 */
export function pseudoResource(source: string): FluentResource {
  const resource = new FluentResource(source);
  resource.body = resource.body.map((entry) => ({
    ...entry,
    value: entry.value === null ? null : lengthenPattern(entry.value),
    attributes: Object.fromEntries(
      Object.entries(entry.attributes).map(([name, pattern]) => [
        name,
        KEYWORD_ATTRIBUTES.has(name) ? pattern : lengthenPattern(pattern),
      ]),
    ),
  })) as FluentResource['body'];
  return resource;
}

/**
 * A made-up language for tests and the visual check: the English text lengthened and accented, to
 * show where a longer translation would not fit. Players can never choose it.
 */
export function pseudoLocaliser(): Localiser {
  const sources = [engineFtl['en'], uiFtl['en']].map((source) => {
    if (source === undefined) throw new Error('missing English locale text');
    return pseudoResource(source);
  });
  return localiserFromSources('en', 'en-GB', sources);
}
