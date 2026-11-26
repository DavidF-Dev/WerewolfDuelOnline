import { render } from '@testing-library/svelte';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLocaliser, loadLocale, LOCALES } from '@wwd/client-core';
import HistoryGame from '../../src/history/HistoryGame.svelte';
import { historyRecord } from '../backup/fixtures.js';

beforeAll(() => Promise.all(LOCALES.map(loadLocale)));

describe('history row', () => {
  it('a history row reads as one message in every language, with the result in bold', () => {
    for (const locale of LOCALES) {
      const l = createLocaliser(locale);
      const { container, unmount } = render(HistoryGame, {
        props: { localiser: l, record: historyRecord('g1', 0) },
      });
      const title = container.querySelector('.title')!;
      const result = l.t('history-won');
      expect(title.textContent, locale).toBe(l.t('history-row-title', { result, opponent: 'Ada' }));
      expect(title.querySelector('strong')?.textContent, locale).toBe(result);
      unmount();
    }
  });

  it('keeps the English row as it was', () => {
    const { container } = render(HistoryGame, {
      props: { localiser: createLocaliser('en'), record: historyRecord('g1', 0) },
    });
    expect(container.querySelector('.title')?.textContent).toBe('Won vs Ada');
  });
});
