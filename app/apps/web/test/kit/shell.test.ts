import { render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import App from '../../src/App.svelte';
import { showScreenTop } from '../../src/shell.js';

const localiser = createLocaliser('en');

async function goTo(hash: string): Promise<void> {
  if (location.hash === hash) return;
  const changed = new Promise((resolve) =>
    window.addEventListener('hashchange', resolve, { once: true }),
  );
  location.hash = hash;
  await changed;
}

afterEach(async () => {
  await goTo('#/');
  vi.restoreAllMocks();
});

describe('app shell', () => {
  it('route change scrolls to top and focuses the heading', async () => {
    const scroll = vi.spyOn(window, 'scrollTo');
    render(App);
    expect(document.activeElement).toBe(document.body);
    expect(scroll).not.toHaveBeenCalled();

    await goTo('#/settings');
    const heading = screen.getByRole('heading', {
      level: 1,
      name: localiser.t('settings-heading'),
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(scroll).toHaveBeenCalledWith(0, 0);

    await goTo('#/about');
    const about = screen.getByRole('heading', { level: 1, name: localiser.t('about-heading') });
    await waitFor(() => expect(document.activeElement).toBe(about));
  });

  it('leaves focus where the new screen put it', () => {
    const scroll = vi.spyOn(window, 'scrollTo');
    const heading = document.createElement('h1');
    const action = document.createElement('button');
    document.body.append(heading, action);
    action.focus();
    showScreenTop();
    expect(document.activeElement).toBe(action);
    expect(scroll).toHaveBeenCalledWith(0, 0);
    heading.remove();
    action.remove();
  });
});
