import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import MarkerIcon from '../../src/components/MarkerIcon.svelte';
import { MARKERS } from '../../src/themes/resolve.js';

const localiser = createLocaliser('en');

describe('MarkerIcon', () => {
  it('labels each marker in text beside its icon', () => {
    for (const marker of MARKERS) {
      const { container, unmount } = render(MarkerIcon, { props: { localiser, marker } });
      expect(container.querySelector('[data-part="icon"]')?.getAttribute('aria-hidden')).toBe(
        'true',
      );
      expect(container.textContent?.trim()).toBe(localiser.t(`marker-${marker}`));
      unmount();
    }
  });

  it('marker tokens wrap Cross, Fang, Hourglass and Potion but not Health or Badge', () => {
    const tokens = MARKERS.filter((marker) => {
      const { container, unmount } = render(MarkerIcon, { props: { localiser, marker } });
      const icon = container.querySelector<HTMLElement>('[data-part="icon"]');
      expect(icon?.querySelector('svg use')?.getAttribute('href'), marker).toContain(
        `markers-${marker}`,
      );
      const token = icon?.dataset['token'] !== undefined;
      expect(icon?.classList.contains('token'), marker).toBe(token);
      unmount();
      return token;
    });
    expect(tokens).toEqual(['cross', 'fang', 'hourglass', 'potion']);
  });

  it('a gained marker has a ringed token and no words', () => {
    const { container } = render(MarkerIcon, { props: { marker: 'hourglass', ring: 'gain' } });
    const marker = container.querySelector('[data-part="marker"]');
    expect(marker?.getAttribute('aria-hidden')).toBe('true');
    expect(marker?.querySelector('[data-part="icon"]')?.getAttribute('data-ring')).toBe('gain');
    expect(marker?.textContent?.trim()).toBe('');
  });

  it('shows a count with its label', () => {
    render(MarkerIcon, { props: { localiser, marker: 'fang', count: 2 } });
    expect(screen.getByText('Fangs: 2')).toBeTruthy();
  });

  it('a compact marker shows the count and keeps the full label', () => {
    const { container } = render(MarkerIcon, {
      props: { localiser, marker: 'health', count: 1, compact: true },
    });
    const marker = container.querySelector('[data-part="marker"]');
    expect(marker?.getAttribute('title')).toBe('Health: 1');
    expect(screen.getByText('1', { selector: '[aria-hidden="true"]' })).toBeTruthy();
    expect(screen.getByText('Health: 1', { selector: '.visually-hidden' })).toBeTruthy();
  });
});
