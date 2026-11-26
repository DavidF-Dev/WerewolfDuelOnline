import { describe, expect, it } from 'vitest';
import { applySettings } from '../../src/settings/apply.js';
import { activeLocaliser, languageSettled } from '../../src/settings/language.svelte.js';
import { DEFAULT_SETTINGS, type Settings } from '../../src/settings/settings.js';

const apply = (language: Settings['language'], root: HTMLElement) =>
  applySettings({ ...DEFAULT_SETTINGS, language }, root);

describe('loading a language', () => {
  it('a language whose text is not loaded yet becomes active once it has loaded', async () => {
    const root = document.createElement('div');
    apply('ja', root);
    // The English text stays until the Japanese text is in, so nothing shows an id.
    expect(activeLocaliser().locale).toBe('en-GB');
    await languageSettled();
    expect(root.lang).toBe('ja-JP');
    expect(activeLocaliser().t('settings-heading')).toBe('設定');
  });

  it('the language chosen last wins while an earlier one is still loading', async () => {
    const root = document.createElement('div');
    apply('de', root);
    apply('en', root);
    await languageSettled();
    expect(root.lang).toBe('en-GB');
    expect(activeLocaliser().locale).toBe('en-GB');
    apply('de', root);
    await languageSettled();
    expect(activeLocaliser().locale).toBe('de-DE');
  });
});
