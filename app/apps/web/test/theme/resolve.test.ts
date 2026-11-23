import { describe, expect, it } from 'vitest';
import { TARGET_CARDS, targetId } from '../../src/cards.js';
import placeholder from '../../src/themes/placeholder/theme.json';
import { MARKERS, THEME_PACKS, createArtResolver, resolveArt } from '../../src/themes/resolve.js';

describe('theme packs', () => {
  it('the placeholder pack covers every card and marker, with credits and a licence', () => {
    expect(Object.keys(placeholder.cards).sort()).toEqual(TARGET_CARDS.map(targetId).sort());
    expect(Object.keys(placeholder.markers).sort()).toEqual([...MARKERS].sort());
    expect(placeholder.credits.length).toBeGreaterThan(0);
    expect(placeholder.licence).not.toBe('');
  });

  it('resolves each placeholder entry to its own SVG', () => {
    // Small files are inlined as data URLs.
    const svg = /^data:image\/svg\+xml,|\.svg$/;
    expect(resolveArt('placeholder', 'cards', 'knight')).toMatch(svg);
    expect(resolveArt('placeholder', 'markers', 'hourglass')).toMatch(svg);
    expect(resolveArt('placeholder', 'cards', 'knight')).not.toBe(
      resolveArt('placeholder', 'cards', 'seer'),
    );
  });

  it('missing theme entries fall back to the placeholder', () => {
    const resolve = createArtResolver({
      ...THEME_PACKS,
      sparse: { cards: { knight: 'sparse-knight.svg' }, markers: {} },
    });
    expect(resolve('sparse', 'cards', 'knight')).toBe('sparse-knight.svg');
    expect(resolve('sparse', 'cards', 'seer')).toBe(resolveArt('placeholder', 'cards', 'seer'));
    expect(resolve('sparse', 'markers', 'fang')).toBe(resolveArt('placeholder', 'markers', 'fang'));
    expect(resolve('missing', 'cards', 'fool')).toBe(resolveArt('placeholder', 'cards', 'fool'));
  });
});
