import { FluentBundle, FluentResource, type FluentVariable } from '@fluent/bundle';
import { engineFtl } from '@wwd/engine';
import type { Event, Seat } from '@wwd/engine';
import { uiFtl } from './generated/ui-ftl.js';
import { renderEvent } from './render-event.js';

export type MessageArgs = Record<string, string | number>;

export interface Translator {
  /** Formats message `id`, or returns `id` itself when it cannot be formatted. */
  t(id: string, args?: MessageArgs): string;
}

function createTranslator(locale: 'en'): Translator {
  const bundle = new FluentBundle(locale, { useIsolating: false });
  for (const source of [engineFtl[locale], uiFtl[locale]]) {
    if (source === undefined) throw new Error(`missing locale text for ${locale}`);
    const errors = bundle.addResource(new FluentResource(source));
    if (errors.length > 0) throw new Error(`invalid locale text: ${errors.join('; ')}`);
  }
  return {
    t(id, args) {
      const pattern = bundle.getMessage(id)?.value;
      if (pattern === null || pattern === undefined) return id;
      const errors: Error[] = [];
      const text = bundle.formatPattern(pattern, args as Record<string, FluentVariable>, errors);
      return errors.length === 0 ? text : id;
    },
  };
}

export interface Localiser extends Translator {
  /** Describes an event as one sentence, with seats worded for `perspective`; a null perspective names them Player 1 and Player 2. */
  renderEvent(event: Event, perspective: Seat | null): string;
}

export function createLocaliser(locale: 'en'): Localiser {
  const translator = createTranslator(locale);
  const listFormat = new Intl.ListFormat('en-GB', { type: 'conjunction' });
  const list = (items: string[]): string => listFormat.format(items);
  return {
    t: translator.t,
    renderEvent: (event, perspective) => renderEvent(translator, list, event, perspective),
  };
}
