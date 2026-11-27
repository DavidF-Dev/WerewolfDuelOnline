import { render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import { setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';
import MarkerList from '../../src/table/MarkerList.svelte';
import type { Markers } from '../../src/table/shown-markers.js';

const localiser = createLocaliser('en');

afterEach(() => {
  setDisplaySettings(DEFAULT_SETTINGS);
  vi.useRealTimers();
});

const markers = (potion: boolean): Markers => ({
  health: 2,
  cross: 0,
  fang: 0,
  hourglass: 1,
  potion,
});

function renderList(animate: boolean) {
  const result = render(MarkerList, {
    props: { localiser, markers: markers(true), hasBadge: false, animate, testId: 'my' },
  });
  const potion = (): HTMLElement | null =>
    result.container.querySelector<HTMLElement>('[data-marker="potion"]');
  return { ...result, potion };
}

describe('MarkerList', () => {
  it('a held Potion shows as 1, named the Potion', () => {
    const { potion } = renderList(true);
    expect(potion()?.querySelector('[data-part="count"]')?.textContent).toBe('1');
    expect(potion()?.querySelector('.visually-hidden')?.textContent).toBe('Potion');
    expect(potion()?.querySelector('[data-change]')).toBeNull();
  });

  it('a spent Potion shows its loss before it leaves', async () => {
    vi.useFakeTimers();
    const { potion, rerender } = renderList(true);
    await rerender({ markers: markers(false) });
    const cell = potion()?.querySelector<HTMLElement>('[data-part="count-cell"]');
    expect(cell?.dataset['change']).toBe('loss');
    expect(cell?.querySelector('[data-part="delta"]')?.textContent).toBe('−1');
    expect(potion()?.getAttribute('aria-hidden')).toBe('true');
    await vi.advanceTimersByTimeAsync(1_250);
    expect(potion()).toBeNull();
  });

  it('a spent Potion under reduced motion shows the still highlight, then leaves', async () => {
    vi.useFakeTimers();
    setDisplaySettings({ ...DEFAULT_SETTINGS, reducedMotion: 'on' });
    const { potion, rerender } = renderList(true);
    await rerender({ markers: markers(false) });
    const cell = potion()?.querySelector<HTMLElement>('[data-part="count-cell"]');
    expect(cell?.classList.contains('still')).toBe(true);
    expect(cell?.dataset['change']).toBe('loss');
    await vi.advanceTimersByTimeAsync(1_250);
    expect(potion()).toBeNull();
  });

  it('a spent Potion leaves at once when changes are not animated', async () => {
    const { potion, rerender } = renderList(false);
    await rerender({ markers: markers(false) });
    expect(potion()).toBeNull();
  });
});
