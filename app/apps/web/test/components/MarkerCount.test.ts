import { render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import MarkerCount from '../../src/components/MarkerCount.svelte';
import { setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';

const localiser = createLocaliser('en');

afterEach(() => {
  setDisplaySettings(DEFAULT_SETTINGS);
  vi.useRealTimers();
});

function renderCount(value: number, animate = true) {
  const result = render(MarkerCount, {
    props: { localiser, marker: 'hourglass', value, animate },
  });
  const cell = (): HTMLElement =>
    result.container.querySelector<HTMLElement>('[data-part="count-cell"]')!;
  const delta = (): HTMLElement | null => result.container.querySelector('[data-part="delta"]');
  return { ...result, cell, delta };
}

describe('MarkerCount', () => {
  it('no animation on first render', () => {
    const { cell, delta } = renderCount(2);
    expect(cell().dataset['change']).toBeUndefined();
    expect(delta()).toBeNull();
    expect(cell().textContent).toContain('Hourglasses: 2');
  });

  it('a rise adds the gain class and +1', async () => {
    const { cell, delta, rerender } = renderCount(2);
    await rerender({ value: 3 });
    expect(cell().dataset['change']).toBe('gain');
    expect(cell().classList.contains('gain')).toBe(true);
    expect(delta()?.textContent).toBe('+1');
    expect(delta()?.getAttribute('aria-hidden')).toBe('true');
    // The accessible name is the count's, with nothing added.
    expect(cell().querySelector('.visually-hidden')?.textContent).toBe('Hourglasses: 3');
  });

  it('a fall adds the loss class and −1', async () => {
    const { cell, delta, rerender } = renderCount(2);
    await rerender({ value: 1 });
    expect(cell().dataset['change']).toBe('loss');
    expect(cell().classList.contains('loss')).toBe(true);
    expect(delta()?.textContent).toBe('−1');
  });

  it('reduced motion uses the still highlight', async () => {
    vi.useFakeTimers();
    setDisplaySettings({ ...DEFAULT_SETTINGS, reducedMotion: 'on' });
    const { cell, delta, rerender } = renderCount(0);
    await rerender({ value: 1 });
    expect(cell().classList.contains('still')).toBe(true);
    expect(delta()?.textContent).toBe('+1');
    await vi.advanceTimersByTimeAsync(1_250);
    expect(cell().dataset['change']).toBeUndefined();
    expect(delta()).toBeNull();
  });

  it('does not animate when told not to', async () => {
    const { cell, rerender } = renderCount(2, false);
    await rerender({ value: 3 });
    expect(cell().dataset['change']).toBeUndefined();
    expect(cell().textContent).toContain('3');
  });
});
