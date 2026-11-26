import { FluentBundle, FluentResource, type FluentVariable } from '@fluent/bundle';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { engineFtl, type Event, type EventKind } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import {
  plainText,
  richMessage,
  type MessageArgs,
  type RichKinds,
  type RichPart,
  type Translator,
} from '../src/index.js';
import { localiserFromSources } from '../src/i18n.js';
import { uiFtl } from '../src/generated/ui-ftl.js';

/** A translator over `source` alone, formatted as the localiser formats. */
function translator(source: string): Translator {
  const bundle = new FluentBundle('en', { useIsolating: false });
  const errors = bundle.addResource(new FluentResource(source));
  if (errors.length > 0) throw new Error(errors.join('; '));
  return {
    t(id, args) {
      const pattern = bundle.getMessage(id)?.value;
      if (pattern === null || pattern === undefined) return id;
      return bundle.formatPattern(pattern, args as Record<string, FluentVariable>);
    },
  };
}

const KINDS: RichKinds = {
  actorName: 'player',
  attacker: 'character',
  victim: 'character',
  marker: { marker: 'health' },
};

const ARGS: MessageArgs = {
  actor: 'you',
  actorName: 'You',
  attacker: 'Knight',
  victim: 'Wolfen',
  marker: 'Health',
  n: 1,
};

describe('rich text', () => {
  it('rich text survives reordered arguments', () => {
    const english = translator(`
hit = { $actorName } { $actor ->
        [you] hit
       *[other] hits
    } the { $victim } with the { $attacker }, losing { $n } { $marker }.
`);
    const reordered = translator(`
hit = { $marker } ×{ $n }: { $attacker } → { $victim } ({ $actorName }{ $actor ->
        [you] , well done
       *[other] {""}
    }).
`);

    expect(richMessage(english, 'hit', ARGS, KINDS)).toEqual([
      { player: 'You' },
      { text: ' hit the ' },
      { character: 'Wolfen' },
      { text: ' with the ' },
      { character: 'Knight' },
      { text: ', losing 1 ' },
      { marker: 'health', label: 'Health' },
      { text: '.' },
    ]);
    expect(richMessage(reordered, 'hit', ARGS, KINDS)).toEqual([
      { marker: 'health', label: 'Health' },
      { text: ' ×1: ' },
      { character: 'Knight' },
      { text: ' → ' },
      { character: 'Wolfen' },
      { text: ' (' },
      { player: 'You' },
      { text: ', well done).' },
    ]);
    for (const tr of [english, reordered]) {
      expect(plainText(richMessage(tr, 'hit', ARGS, KINDS))).toBe(tr.t('hit', ARGS));
    }
  });

  it('marks each use of an argument used twice', () => {
    const tr = translator('twice = { $actorName } and { $actorName } again.');
    const parts = richMessage(tr, 'twice', { actorName: 'You' }, { actorName: 'player' });
    expect(plainText(parts)).toBe(tr.t('twice', { actorName: 'You' }));
    expect(parts.filter((part) => 'player' in part)).toHaveLength(2);
  });

  it('falls back to plain text when the marked message reads differently', () => {
    const tr = translator(`
pick = { $marker ->
        [Health] Ouch
       *[other] Fine
    }, { $marker }.
`);
    const parts = richMessage(tr, 'pick', { marker: 'Health' }, { marker: { marker: 'health' } });
    expect(parts).toEqual([{ text: 'Ouch, Health.' }]);
  });

  it('is the plain message when nothing is marked or the message is missing', () => {
    const tr = translator('plain = Nothing to mark.');
    expect(richMessage(tr, 'plain')).toEqual([{ text: 'Nothing to mark.' }]);
    expect(richMessage(tr, 'missing', ARGS, KINDS)).toEqual([{ text: 'missing' }]);
  });
});

const fixture = (name: string): string =>
  readFileSync(
    new URL(`../../../../engine/crates/wwd-cli/tests/fixtures/${name}.ftl`, import.meta.url),
    'utf8',
  );

/** `parts` with neighbouring plain text joined, so tests need not know how it was split. */
function merged(parts: readonly RichPart[]): RichPart[] {
  const out: RichPart[] = [];
  for (const part of parts) {
    const last = out[out.length - 1];
    if ('text' in part && last !== undefined && 'text' in last) {
      out[out.length - 1] = { text: last.text + part.text };
    } else out.push(part);
  }
  return out;
}

describe('rich text with character forms', () => {
  beforeAll(loadEngineForNode);

  it('rich text bolds the name and not its article', () => {
    const l = localiserFromSources(
      'en',
      'en-GB',
      [engineFtl['en']!, uiFtl['en']!],
      [fixture('grammar')],
    );
    const ev = (kind: EventKind): Event => ({ visibility: 'public', kind });

    expect(
      merged(l.richEvent(ev({ character_resolved: { seat: 'p0', character: 'hunter' } }), 'p0')),
    ).toEqual([{ text: 'Es wirkt des ' }, { character: 'Jägers' }, { text: '.' }]);
    expect(
      merged(l.richEvent(ev({ hand_dealt: { seat: 'p0', cards: ['hunter', 'witch'] } }), null)),
    ).toEqual([
      { player: 'Player 1' },
      { text: ' bekommt den ' },
      { character: 'Jäger' },
      { text: ' and die ' },
      { character: 'Hexe' },
      { text: '.' },
    ]);
    const revealed = l.richEvent(
      ev({
        plans_revealed: {
          plans: [
            { character: 'hunter', targets: [{ character: 'witch' }, 'fool'] },
            { character: 'witch', targets: [] },
          ],
          effective: [1, 6],
          order: ['p0', 'p1'],
        },
      }),
      null,
    );
    expect(merged(revealed).slice(0, 6)).toEqual([
      { text: 'Plans revealed. ' },
      { player: 'Player 1' },
      { text: ' plays den ' },
      { character: 'Jäger' },
      { text: ' gegen die ' },
      { character: 'Hexe' },
    ]);
    expect(merged(revealed)[6]).toEqual({ text: ' and den Narren at initiative 1. ' });
  });
});
