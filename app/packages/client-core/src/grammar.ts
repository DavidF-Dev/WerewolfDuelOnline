import type { FluentValue } from '@fluent/bundle';
import type { MessageArgs, Translator } from './i18n.js';
import { plainText, richMessage, unmarked, type RichPart } from './rich-text.js';

export const CASES = ['nom', 'acc', 'dat', 'gen'] as const;
export const ARTICLES = ['def', 'indef', 'none'] as const;
/** The values a character message's `.gender` attribute may take. */
export const GENDERS = ['masculine', 'feminine', 'neuter'] as const;

/** A grammatical case a character's name can be put in. */
export type GrammaticalCase = (typeof CASES)[number];
/** The article a character's name can be given. */
export type Article = (typeof ARTICLES)[number];

/** The form a character's name takes in a sentence. */
export interface CharacterForm {
  readonly case: GrammaticalCase;
  readonly article: Article;
}

/** The bare name, as a heading or a label shows it. */
export const BARE: CharacterForm = { case: 'nom', article: 'none' };

/** The message that places the article around a character's name. */
const FORM_MESSAGE = 'grammar-character-form';

const isCase = (value: unknown): value is GrammaticalCase => CASES.some((kase) => kase === value);
const isArticle = (value: unknown): value is Article =>
  ARTICLES.some((article) => article === value);

/** A character's name cannot be given in a form, so the message naming it cannot be formatted. */
export class GrammarError extends Error {
  override readonly name = 'GrammarError';
}

/** The text of attribute `name` of message `id`, or undefined when it has none. */
export function attribute(tr: Translator, id: string, name: string): string | undefined {
  const key = `${id}.${name}`;
  const text = tr.t(key);
  return text === key ? undefined : text;
}

/** What a translator's locale gives for each character: its gender and its forms. */
interface Forms {
  readonly genders: Map<string, string>;
  readonly parts: Map<string, readonly RichPart[] | GrammarError>;
}

const formsOf = new WeakMap<Translator, Forms>();

function forms(tr: Translator): Forms {
  let found = formsOf.get(tr);
  if (found === undefined) {
    found = { genders: new Map(), parts: new Map() };
    formsOf.set(tr, found);
  }
  return found;
}

/** The character message for `id`, which may spell its words apart with `_` or `-`. */
const characterMessage = (id: string): string => `character-${id.replaceAll('_', '-')}`;

/** Character `id`'s name in `form`, formatted afresh. */
function formatParts(tr: Translator, id: string, form: CharacterForm): readonly RichPart[] {
  const message = characterMessage(id);
  const name = tr.t(message);
  if (name === message) throw new GrammarError(`there is no character ${id}`);
  const inCase = attribute(tr, message, form.case) ?? name;
  const args: MessageArgs = {
    name: inCase,
    case: form.case,
    article: form.article,
    gender: gender(tr, id),
  };
  if (tr.t(FORM_MESSAGE, args) === FORM_MESSAGE) {
    // Without the message, the name is the same in every form; with it, a failure is an error.
    if (tr.has?.(FORM_MESSAGE) !== true) return Object.freeze([{ character: inCase }]);
    throw new GrammarError(`${FORM_MESSAGE} cannot name ${id} in ${form.case}, ${form.article}`);
  }
  return Object.freeze(richMessage(tr, FORM_MESSAGE, args, { name: 'character' }));
}

/**
 * Character `id`'s name in `form`, as plain and emphasised parts: the name alone is emphasised.
 * Throws a `GrammarError` when the locale cannot give it.
 */
export function characterParts(
  tr: Translator,
  id: string,
  form: CharacterForm = BARE,
): readonly RichPart[] {
  const { parts } = forms(tr);
  const key = `${id.replaceAll('_', '-')} ${form.case} ${form.article}`;
  let found = parts.get(key);
  if (found === undefined) {
    try {
      found = formatParts(tr, id, form);
    } catch (error) {
      if (!(error instanceof GrammarError)) throw error;
      found = error;
    }
    parts.set(key, found);
  }
  if (found instanceof GrammarError) throw found;
  return found;
}

/** Character `id`'s gender, which is `none` when its message gives none. */
function gender(tr: Translator, id: string): string {
  const { genders } = forms(tr);
  let found = genders.get(id);
  if (found === undefined) {
    found = attribute(tr, characterMessage(id), 'gender') ?? 'none';
    genders.set(id, found);
  }
  return found;
}

/** The form a message's list of characters declares for its items, or the bare name. */
export function listForm(tr: Translator, id: string): CharacterForm {
  const kase = attribute(tr, id, 'list-case');
  const article = attribute(tr, id, 'list-article');
  return {
    case: isCase(kase) ? kase : BARE.case,
    article: isArticle(article) ? article : BARE.article,
  };
}

/** The character id a grammar function is given, with the mark it may carry for rich text. */
function characterArgument(name: string, positional: FluentValue[]) {
  const [value] = positional;
  if (typeof value !== 'string' || positional.length !== 1) {
    throw new TypeError(`${name} needs one character id`);
  }
  return unmarked(value);
}

/**
 * The Fluent function `CHARACTER(id, case: …, article: …)`, which names a character in a form.
 * When `id` is marked for rich text, only the name in the result keeps the mark.
 */
export function characterFunction(
  tr: Translator,
  positional: FluentValue[],
  named: Record<string, FluentValue>,
): string {
  const kase = named['case'] ?? BARE.case;
  const article = named['article'] ?? BARE.article;
  if (!isCase(kase)) throw new RangeError(`CHARACTER has no case ${String(kase)}`);
  if (!isArticle(article)) throw new RangeError(`CHARACTER has no article ${String(article)}`);
  const { words: id, mark } = characterArgument('CHARACTER', positional);
  return characterParts(tr, id, { case: kase, article })
    .map((part) => ('character' in part ? mark(part.character) : plainText([part])))
    .join('');
}

/** The Fluent function `GENDER(id)`, which gives a character's gender for a message to select on. */
export function genderFunction(
  tr: Translator,
  positional: FluentValue[],
  named: Record<string, FluentValue>,
): string {
  if (Object.keys(named).length > 0) throw new RangeError('GENDER takes no options');
  const { words: id } = characterArgument('GENDER', positional);
  if (tr.t(characterMessage(id)) === characterMessage(id)) {
    throw new RangeError(`GENDER has no character ${id}`);
  }
  return gender(tr, id);
}
