import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LOCALES, loadLocale } from '@wwd/client-core';
import { applySettings } from '../../src/settings/apply.js';
import {
  LANGUAGE_NAMES,
  activeLocaliser,
  resolveLanguage,
} from '../../src/settings/language.svelte.js';
import { DEFAULT_SETTINGS, normaliseSettings, type Settings } from '../../src/settings/settings.js';

const apply = (language: Settings['language'], root = document.createElement('div')) => {
  applySettings({ ...DEFAULT_SETTINGS, language }, root);
  return root;
};

beforeAll(() => Promise.all(LOCALES.map(loadLocale)));

afterEach(() => {
  vi.unstubAllGlobals();
  applySettings(DEFAULT_SETTINGS, document.createElement('div'));
});

describe('language', () => {
  it('system language picks the first supported browser language', () => {
    expect(resolveLanguage('system', ['de-AT', 'en'])).toBe('de');
    expect(resolveLanguage('system', ['ja-JP'])).toBe('ja');
    expect(resolveLanguage('system', ['en-US'])).toBe('en');
    expect(resolveLanguage('system', ['fr', 'de'])).toBe('de');
    expect(resolveLanguage('system', ['fr'])).toBe('en');
    expect(resolveLanguage('system', [])).toBe('en');
    expect(resolveLanguage('system', ['en-GB', 'ja'])).toBe('en');
    expect(resolveLanguage('system', ['DE-ch'])).toBe('de');
  });

  it('a chosen language wins over the browser languages', () => {
    expect(resolveLanguage('ja', ['de-AT'])).toBe('ja');
    expect(resolveLanguage('en', ['de-AT'])).toBe('en');
    expect(resolveLanguage('de', [])).toBe('de');
  });

  it('names each language in itself', () => {
    expect(LANGUAGE_NAMES).toEqual({ en: 'English', de: 'Deutsch', ja: '日本語' });
  });

  it('html lang follows the active language', () => {
    expect(apply('de').lang).toBe('de-DE');
    expect(activeLocaliser().locale).toBe('de-DE');
    expect(apply('ja').lang).toBe('ja-JP');
    expect(apply('en').lang).toBe('en-GB');
    vi.stubGlobal('navigator', { ...navigator, languages: ['ja-JP', 'en'] });
    expect(apply('system').lang).toBe('ja-JP');
    expect(activeLocaliser().locale).toBe('ja-JP');
  });

  it('keeps one localiser per language', () => {
    apply('de');
    const german = activeLocaliser();
    apply('en');
    expect(activeLocaliser()).not.toBe(german);
    apply('de');
    expect(activeLocaliser()).toBe(german);
  });

  it('an unknown stored language falls back to System', () => {
    expect(normaliseSettings({ language: 'fr' as Settings['language'] }).language).toBe('system');
    expect(normaliseSettings({ language: 'ja' }).language).toBe('ja');
  });
});
