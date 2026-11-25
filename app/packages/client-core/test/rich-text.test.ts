import { FluentBundle, FluentResource, type FluentVariable } from '@fluent/bundle';
import { describe, expect, it } from 'vitest';
import {
  plainText,
  richMessage,
  type MessageArgs,
  type RichKinds,
  type Translator,
} from '../src/index.js';

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
