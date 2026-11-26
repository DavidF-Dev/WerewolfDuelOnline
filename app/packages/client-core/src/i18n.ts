import { FluentBundle, FluentResource, type FluentVariable } from '@fluent/bundle';
import { engineFtl, loadEngineFtl } from '@wwd/engine';
import type { Character, Event, Plan, Seat } from '@wwd/engine';
import { loadUiFtl, uiFtl } from './generated/ui-ftl.js';
import { characterFunction, genderFunction } from './grammar.js';
import { cardsMessage, planParts, renderEvent, richEvent } from './render-event.js';
import type { RichPart } from './rich-text.js';

export type MessageArgs = Record<string, string | number>;

export interface Translator {
  /**
   * Formats message `id`, or returns `id` itself when it cannot be formatted. An id of the form
   * `message.attribute` formats that attribute of the message.
   */
  t(id: string, args?: MessageArgs): string;
  /** Whether the locale has message `id`, formatted or not; undefined when it cannot tell. */
  has?(id: string): boolean;
}

/** A locale's messages, as Fluent source text or as a parsed resource. */
export type LocaleSource = string | FluentResource;

function createTranslator(
  language: string,
  sources: readonly LocaleSource[],
  overrides: readonly LocaleSource[],
): Required<Translator> {
  const bundle = new FluentBundle(language, {
    useIsolating: false,
    functions: {
      CHARACTER: (positional, named) => characterFunction(translator, positional, named),
      GENDER: (positional, named) => genderFunction(translator, positional, named),
    },
  });
  const add = (source: LocaleSource, allowOverrides: boolean) => {
    const resource = typeof source === 'string' ? new FluentResource(source) : source;
    const errors = bundle.addResource(resource, { allowOverrides });
    if (errors.length > 0) throw new Error(`invalid locale text: ${errors.join('; ')}`);
  };
  for (const source of sources) add(source, false);
  for (const source of overrides) add(source, true);
  const translator: Required<Translator> = {
    t(id, args) {
      const [messageId = id, attribute] = id.split('.', 2);
      const message = bundle.getMessage(messageId);
      const pattern = attribute === undefined ? message?.value : message?.attributes[attribute];
      if (pattern === null || pattern === undefined) return id;
      const errors: Error[] = [];
      const text = bundle.formatPattern(pattern, args as Record<string, FluentVariable>, errors);
      return errors.length === 0 ? text : id;
    },
    has: (id) => bundle.hasMessage(id),
  };
  return translator;
}

export interface Localiser extends Translator {
  /** Describes an event as one sentence, with seats worded for `perspective`; a null perspective names them Player 1 and Player 2. */
  renderEvent(event: Event, perspective: Seat | null): string;
  /** The same sentence as `renderEvent`, with player and character names and markers marked out. */
  richEvent(event: Event, perspective: Seat | null): RichPart[];
  /** A plan as the messages word it, such as "Knight targeting the Wolfen", with names marked out. */
  plan(plan: Plan): RichPart[];
  /**
   * Message `id` with `cards` as its `cards` list, each in the form the message declares, and
   * names marked out; the id alone when a card cannot be named.
   */
  cardsMessage(id: string, cards: readonly Character[], args?: MessageArgs): RichPart[];
  /** The language the messages are in, such as `de`. */
  readonly language: string;
  /**
   * The locale that dates, times and lists are formatted in, such as `de-DE`: a format locale
   * for `Intl`, not the `Locale` the localiser was made for, which is `language`.
   */
  readonly locale: string;
}

/** The languages the game can be played in. */
export const LOCALES = ['en', 'de', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

const FORMAT_LOCALES: Readonly<Record<Locale, string>> = { en: 'en-GB', de: 'de-DE', ja: 'ja-JP' };

/** Each language's engine and interface text, once it has loaded. */
const loaded = new Map<string, readonly [string, string]>([
  ['en', [engineFtl['en']!, uiFtl['en']!]],
]);
const loading = new Map<string, Promise<void>>();

/** Whether `locale`'s text has loaded, so that `createLocaliser` can make its localiser. */
export const isLocaleLoaded = (locale: Locale): boolean => loaded.has(locale);

/**
 * Loads `locale`'s text, which English has from the start and every other language fetches the
 * first time it is asked for; a failed load is tried again the next time.
 */
export function loadLocale(locale: Locale): Promise<void> {
  if (loaded.has(locale)) return Promise.resolve();
  let load = loading.get(locale);
  if (load === undefined) {
    load = Promise.all([loadEngineFtl(locale), loadUiFtl(locale)]).then(
      ([engine, ui]) => {
        loaded.set(locale, [engine, ui]);
        loading.delete(locale);
      },
      (error: unknown) => {
        loading.delete(locale);
        throw error;
      },
    );
    loading.set(locale, load);
  }
  return load;
}

/** A localiser for `locale`, whose text must have loaded (see `loadLocale`). */
export function createLocaliser(locale: Locale): Localiser {
  const text = loaded.get(locale);
  const formatLocale = FORMAT_LOCALES[locale];
  if (formatLocale === undefined) throw new Error(`${locale} is not a language of the game`);
  if (text === undefined) throw new Error(`the text for ${locale} is not loaded`);
  return localiserFromSources(locale, formatLocale, text);
}

/**
 * A localiser over the message files `sources` in `language`, formatting dates, times and lists
 * in `formatLocale`. Messages in `overrides` replace any of the same id.
 */
export function localiserFromSources(
  language: string,
  formatLocale: string,
  sources: readonly LocaleSource[],
  overrides: readonly LocaleSource[] = [],
): Localiser {
  const translator = createTranslator(language, sources, overrides);
  const listFormat = new Intl.ListFormat(formatLocale, { type: 'conjunction' });
  const list = (items: string[]) => listFormat.formatToParts(items);
  return {
    t: translator.t,
    has: translator.has,
    language,
    locale: formatLocale,
    renderEvent: (event, perspective) => renderEvent(translator, list, event, perspective),
    richEvent: (event, perspective) => richEvent(translator, list, event, perspective),
    plan: (plan) => planParts(translator, list, plan),
    cardsMessage: (id, cards, args) => cardsMessage(translator, list, id, cards, args),
  };
}
