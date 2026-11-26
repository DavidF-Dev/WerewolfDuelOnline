import type { MessageArgs, Translator } from './i18n.js';

/** A marker, as game text names it and the theme pack draws it. */
export type MarkerId = 'health' | 'cross' | 'fang' | 'hourglass' | 'badge' | 'potion';

/**
 * What a message argument names: a player, a character, or a marker word. `parts` gives an
 * argument that is itself rich text, such as a list of names; its value must read as those parts.
 */
export type RichKind =
  'player' | 'character' | { marker: MarkerId } | { parts: readonly RichPart[] };

/** The kind of each argument of a message that is emphasised; other arguments stay plain. */
export type RichKinds = Readonly<Record<string, RichKind>>;

export type RichPart =
  | { text: string }
  | { player: string }
  | { character: string }
  | { marker: MarkerId; label: string };

const OPEN = '';
const CLOSE = '';
// Each marked argument is tagged with one private-use character, numbered from here.
const FIRST_TAG = 0xe100;
const MARKED = /([-])([^]*)/gu;

/** The words of `parts`, as they read without emphasis. */
export function plainText(parts: readonly RichPart[]): string {
  return parts
    .map((part) =>
      'text' in part
        ? part.text
        : 'player' in part
          ? part.player
          : 'character' in part
            ? part.character
            : part.label,
    )
    .join('');
}

const MARK = /^\u{E000}([\u{E100}-\u{E1FF}])([^\u{E000}\u{E001}]*)\u{E001}$/u;

/**
 * The words of a message argument that `richMessage` may have marked, and a function that marks
 * other words the same way, so that they take the argument's place in the rich text.
 */
export function unmarked(value: string): { words: string; mark: (words: string) => string } {
  const match = MARK.exec(value);
  if (match === null) return { words: value, mark: (words) => words };
  const tag = match[1]!;
  return { words: match[2]!, mark: (words) => `${OPEN}${tag}${words}${CLOSE}` };
}

const textOnly = (text: string): RichPart[] => (text === '' ? [] : [{ text }]);

function partsFor(kind: RichKind, value: string): RichPart[] {
  if (kind === 'player') return [{ player: value }];
  if (kind === 'character') return [{ character: value }];
  if ('parts' in kind) return [...kind.parts];
  return [{ marker: kind.marker, label: value }];
}

/**
 * Formats message `id` and splits it into plain and emphasised parts, wherever the translation
 * puts the arguments named in `kinds`. Their words always read as the plain message does; when
 * marking an argument would change them, such as one the message selects on, the message is
 * returned as plain text.
 */
export function richMessage(
  tr: Translator,
  id: string,
  args: MessageArgs = {},
  kinds: RichKinds = {},
): RichPart[] {
  const plain = tr.t(id, args);
  const names = Object.keys(kinds).filter((name) => name in args);
  if (names.length === 0) return textOnly(plain);

  const marked: MessageArgs = { ...args };
  names.forEach((name, i) => {
    marked[name] = `${OPEN}${String.fromCharCode(FIRST_TAG + i)}${String(args[name])}${CLOSE}`;
  });
  const formatted = tr.t(id, marked);

  const parts: RichPart[] = [];
  let from = 0;
  for (const match of formatted.matchAll(MARKED)) {
    parts.push(...textOnly(formatted.slice(from, match.index)));
    const name = names[match[1]!.charCodeAt(0) - FIRST_TAG];
    const kind = name === undefined ? undefined : kinds[name];
    if (kind === undefined) return textOnly(plain);
    parts.push(...partsFor(kind, match[2]!));
    from = match.index + match[0].length;
  }
  parts.push(...textOnly(formatted.slice(from)));
  return plainText(parts) === plain ? parts : textOnly(plain);
}
