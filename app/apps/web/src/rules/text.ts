import type { Character } from '@wwd/engine';
import { richMessage, type Localiser, type RichKinds, type RichPart } from '@wwd/client-core';
import { CHARACTERS } from '../cards.js';

/** Each marker word a rules message may use, and the message that names it. */
const MARKER_WORDS = {
  cross: ['cross', 'marker-cross'],
  crosses: ['cross', 'marker-crosses'],
  fang: ['fang', 'marker-fang'],
  fangs: ['fang', 'marker-fangs'],
  hourglass: ['hourglass', 'marker-hourglass'],
  potion: ['potion', 'marker-potion'],
  health: ['health', 'marker-health'],
  badge: ['badge', 'marker-badge'],
} as const;

/** The argument a rules message names a character by, such as `wolfKing` for the Wolf King. */
const characterArgument = (c: Character): string =>
  c.replace(/_(\w)/g, (_, letter: string) => letter.toUpperCase());

const KINDS: RichKinds = {
  ...Object.fromEntries(Object.entries(MARKER_WORDS).map(([name, [marker]]) => [name, { marker }])),
  hourglasses: { marker: 'hourglass' },
  ...Object.fromEntries(CHARACTERS.map((c) => [characterArgument(c), 'character'])),
};

/**
 * Rules message `id` as rich text: every marker word it uses drawn with its token, and every
 * character it names in bold.
 */
export function rulesParts(l: Localiser, id: string): RichPart[] {
  const args: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(MARKER_WORDS).map(([name, [, message]]) => [name, l.t(message)]),
    ),
    // The engine names no uncounted Hourglasses, so the plural is the name after a count.
    hourglasses: l.t('marker-hourglass-count', { n: 2 }),
    ...Object.fromEntries(CHARACTERS.map((c) => [characterArgument(c), c])),
  };
  return richMessage(l, id, args, KINDS);
}
