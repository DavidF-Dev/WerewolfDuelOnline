import { describe, expect, it } from 'vitest';
import { TARGET_CARDS, targetId } from '../../src/cards.js';
import placeholder from '../../src/themes/placeholder/theme.json';
import {
  MARKERS,
  THEME_PACKS,
  artSymbol,
  createArtResolver,
  resolveArt,
  spriteMarkup,
  symbolId,
} from '../../src/themes/resolve.js';

describe('theme packs', () => {
  it('the placeholder pack covers every card and marker, with credits and a licence', () => {
    expect(Object.keys(placeholder.cards).sort()).toEqual(TARGET_CARDS.map(targetId).sort());
    expect(Object.keys(placeholder.markers).sort()).toEqual([...MARKERS].sort());
    expect(Object.keys(placeholder.scenery)).toEqual([
      'treeline',
      'treeline-wide',
      'treeline-band',
    ]);
    expect(Object.keys(placeholder.factions).sort()).toEqual(['human', 'werewolf']);
    expect(Object.keys(placeholder.abilities)).toEqual(['spend']);
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
      sparse: {
        cards: { knight: 'sparse-knight.svg' },
        markers: {},
        factions: {},
        abilities: {},
        scenery: {},
      },
    });
    expect(resolve('sparse', 'cards', 'knight')).toBe('sparse-knight.svg');
    expect(resolve('sparse', 'cards', 'seer')).toBe(resolveArt('placeholder', 'cards', 'seer'));
    expect(resolve('sparse', 'markers', 'fang')).toBe(resolveArt('placeholder', 'markers', 'fang'));
    expect(resolve('missing', 'cards', 'fool')).toBe(resolveArt('placeholder', 'cards', 'fool'));
    expect(resolve('sparse', 'abilities', 'spend')).toBe(
      resolveArt('placeholder', 'abilities', 'spend'),
    );
    expect(resolve('sparse', 'scenery', 'treeline')).toBe(
      resolveArt('placeholder', 'scenery', 'treeline'),
    );
  });

  it('the sprite has a symbol for every icon, drawn in the current colour', () => {
    const sprite = spriteMarkup('placeholder');
    const kinds = ['cards', 'markers', 'factions', 'abilities'] as const;
    for (const kind of kinds) {
      for (const id of Object.keys(placeholder[kind])) {
        expect(sprite).toContain(`id="art-placeholder-${kind}-${id}"`);
      }
    }
    expect(sprite).not.toContain('#000');
    expect(spriteMarkup('missing')).toBe(sprite.replaceAll('art-placeholder-', 'art-missing-'));
  });

  it('a sprite reference adds the theme sprite to the page once', () => {
    const href = artSymbol('placeholder', 'abilities', 'spend');
    expect(href).toBe(`#${symbolId('placeholder', 'abilities', 'spend')}`);
    artSymbol('placeholder', 'cards', 'knight');
    expect(document.querySelectorAll('#art-placeholder')).toHaveLength(1);
    expect(document.querySelector(href)?.tagName.toLowerCase()).toBe('symbol');
  });
});
