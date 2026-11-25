import { afterEach, describe, expect, it, vi } from 'vitest';
import { applySettings, motionReduced, watchSystemPreferences } from '../../src/settings/apply.js';
import { display, setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS, type Settings } from '../../src/settings/settings.js';

function media(matching: string[]): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ matches: matching.includes(query), media: query }) as MediaQueryList,
  );
}

const apply = (settings: Partial<Settings>): HTMLElement => {
  const root = document.createElement('div');
  applySettings({ ...DEFAULT_SETTINGS, ...settings }, root);
  return root;
};

afterEach(() => vi.unstubAllGlobals());

describe('applySettings', () => {
  it('sets every attribute', () => {
    media([]);
    const root = apply({
      theme: 'dark',
      highContrast: true,
      reducedMotion: 'on',
      readingFont: 'lexend',
      extraSpacing: true,
      textSize: 125,
    });
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-contrast')).toBe('high');
    expect(root.getAttribute('data-motion')).toBe('reduce');
    expect(root.getAttribute('data-font')).toBe('lexend');
    expect(root.getAttribute('data-spacing')).toBe('extra');
    expect(root.style.getPropertyValue('--text-scale')).toBe('1.25');
  });

  it('removes the optional attributes when the settings are off', () => {
    media([]);
    const root = apply({ highContrast: true, extraSpacing: true, reducedMotion: 'on' });
    applySettings({ ...DEFAULT_SETTINGS, reducedMotion: 'off' }, root);
    expect(root.hasAttribute('data-contrast')).toBe(false);
    expect(root.hasAttribute('data-spacing')).toBe(false);
    expect(root.hasAttribute('data-motion')).toBe(false);
    expect(root.getAttribute('data-font')).toBe('default');
    expect(root.style.getPropertyValue('--text-scale')).toBe('1');
  });

  it('resolves the system theme through the media query', () => {
    media(['(prefers-color-scheme: dark)']);
    expect(apply({ theme: 'system' }).getAttribute('data-theme')).toBe('dark');
    media([]);
    expect(apply({ theme: 'system' }).getAttribute('data-theme')).toBe('light');
    expect(apply({ theme: 'light' }).getAttribute('data-theme')).toBe('light');
  });

  it('reduces motion when the system asks for it', () => {
    media(['(prefers-reduced-motion: reduce)']);
    expect(apply({ reducedMotion: 'system' }).getAttribute('data-motion')).toBe('reduce');
    expect(apply({ reducedMotion: 'off' }).hasAttribute('data-motion')).toBe(false);
    media([]);
    expect(apply({ reducedMotion: 'system' }).hasAttribute('data-motion')).toBe(false);
  });

  it('moves the text size to the nearest offered one', () => {
    media([]);
    expect(apply({ textSize: 10 }).style.getPropertyValue('--text-scale')).toBe('0.9');
    expect(apply({ textSize: 999 }).style.getPropertyValue('--text-scale')).toBe('1.5');
    expect(apply({ textSize: 110 }).style.getPropertyValue('--text-scale')).toBe('1');
    expect(apply({ textSize: 120 }).style.getPropertyValue('--text-scale')).toBe('1.25');
    expect(apply({ textSize: 140 }).style.getPropertyValue('--text-scale')).toBe('1.5');
  });
});

describe('applySettings and the card display', () => {
  afterEach(() => setDisplaySettings(DEFAULT_SETTINGS));

  it('shares the card display settings with the components', () => {
    media([]);
    apply({ colourBlindPatterns: true, cardText: 'text-only' });
    expect(display.colourBlindPatterns).toBe(true);
    expect(display.cardText).toBe('text-only');
  });
});

describe('watchSystemPreferences', () => {
  it('re-applies the current settings when the system theme or motion preference changes', () => {
    const matching = new Set<string>();
    const listeners = new Map<string, Set<() => void>>();
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          get matches() {
            return matching.has(query);
          },
          media: query,
          addEventListener: (_type: string, listener: () => void) => {
            if (!listeners.has(query)) listeners.set(query, new Set());
            listeners.get(query)!.add(listener);
          },
          removeEventListener: (_type: string, listener: () => void) =>
            listeners.get(query)?.delete(listener),
        }) as unknown as MediaQueryList,
    );
    const change = (query: string, on: boolean): void => {
      if (on) matching.add(query);
      else matching.delete(query);
      for (const listener of listeners.get(query) ?? []) listener();
    };
    const DARK = '(prefers-color-scheme: dark)';
    const REDUCE = '(prefers-reduced-motion: reduce)';

    const stop = watchSystemPreferences();
    const root = apply({ theme: 'system', reducedMotion: 'system' });
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.hasAttribute('data-motion')).toBe(false);

    change(DARK, true);
    change(REDUCE, true);
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-motion')).toBe('reduce');
    expect(motionReduced('system')).toBe(true);

    // A setting that is not System ignores the system.
    applySettings({ ...DEFAULT_SETTINGS, theme: 'light', reducedMotion: 'off' }, root);
    change(DARK, false);
    change(DARK, true);
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.hasAttribute('data-motion')).toBe(false);

    applySettings({ ...DEFAULT_SETTINGS, theme: 'system' }, root);
    stop();
    change(DARK, false);
    change(REDUCE, false);
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(motionReduced('system')).toBe(true);
  });
});
