import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Under jsdom `import.meta.url` is not a file URL, so the file is found from the package root.
const css = readFileSync(join(process.cwd(), 'src/theme/tokens.css'), 'utf8');

/** Every rule's colour declarations, keyed by its selector with whitespace collapsed. */
function colourBlocks(source: string): Map<string, Map<string, string>> {
  const blocks = new Map<string, Map<string, string>>();
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, selector, body] of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const colours = new Map<string, string>();
    for (const [, name, value] of body!.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
      colours.set(name!, value!.toLowerCase());
    }
    if (colours.size > 0) blocks.set(selector!.replace(/\s+/g, ' ').trim(), colours);
  }
  return blocks;
}

const THEMES: Record<string, string> = {
  light: ":root, :root[data-theme='light']",
  dark: ":root[data-theme='dark']",
  'light high contrast':
    ":root[data-contrast='high'], :root[data-theme='light'][data-contrast='high']",
  'dark high contrast': ":root[data-theme='dark'][data-contrast='high']",
};

/** Text and its background: 4.5:1. */
const TEXT_PAIRS: [string, string][] = [
  ['--ink', '--bg'],
  ['--ink', '--surface'],
  ['--ink', '--surface-2'],
  ['--ink', '--chip'],
  ['--muted', '--bg'],
  ['--muted', '--surface'],
  ['--muted', '--surface-2'],
  // Links are accent text on the page and on panels.
  ['--accent', '--bg'],
  ['--accent', '--surface'],
  ['--accent', '--surface-2'],
  ['--accent-ink', '--accent'],
  ['--danger', '--surface'],
  ['--danger-ink', '--danger'],
  ['--bar-ink', '--bar-a'],
  ['--bar-ink', '--bar-b'],
];

/** Controls, focus, faction marks and marker icons against what they sit on: 3:1. */
const UI_PAIRS: [string, string][] = [
  ['--control-line', '--surface'],
  ['--control-line', '--bg'],
  ['--focus', '--bg'],
  ['--focus', '--surface'],
  ['--focus', '--surface-2'],
  ['--human', '--surface'],
  ['--human', '--bg'],
  ['--werewolf', '--surface'],
  ['--werewolf', '--bg'],
  ['--neutral', '--surface'],
  ['--heart', '--surface'],
  ['--heart', '--bg'],
  ['--warn', '--surface'],
  ['--warn', '--bg'],
  ['--ok', '--surface'],
  ['--ok', '--bg'],
];

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const blocks = colourBlocks(css);

describe('tokens meet contrast', () => {
  it('measures contrast as WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it('defines the same colour tokens in every theme', () => {
    const names = Object.values(THEMES).map((selector) => {
      const block = blocks.get(selector);
      expect(block, selector).toBeDefined();
      return [...block!.keys()].sort().join(' ');
    });
    expect(new Set(names).size).toBe(1);
  });

  it('keeps the Okabe–Ito faction colours of the Moonlit palette', () => {
    expect(blocks.get(THEMES.light!)?.get('--human')).toBe('#0072b2');
    expect(blocks.get(THEMES.light!)?.get('--werewolf')).toBe('#d55e00');
    expect(blocks.get(THEMES.dark!)?.get('--human')).toBe('#56b4e9');
    expect(blocks.get(THEMES.dark!)?.get('--werewolf')).toBe('#f0884a');
  });

  for (const [theme, selector] of Object.entries(THEMES)) {
    it(`${theme}: text pairs reach 4.5:1 and UI pairs 3:1`, () => {
      const colours = blocks.get(selector)!;
      const ratio = (fg: string, bg: string): number => {
        const [a, b] = [colours.get(fg), colours.get(bg)];
        if (a === undefined || b === undefined) throw new Error(`${theme} lacks ${fg} or ${bg}`);
        return contrast(a, b);
      };
      const failures = [
        ...TEXT_PAIRS.filter(([fg, bg]) => ratio(fg, bg) < 4.5).map(
          ([fg, bg]) => `${fg} on ${bg}: ${ratio(fg, bg).toFixed(2)}`,
        ),
        ...UI_PAIRS.filter(([fg, bg]) => ratio(fg, bg) < 3).map(
          ([fg, bg]) => `${fg} on ${bg}: ${ratio(fg, bg).toFixed(2)}`,
        ),
      ];
      expect(failures).toEqual([]);
    });
  }
});
