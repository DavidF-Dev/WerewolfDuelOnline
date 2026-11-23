import { render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import App from '../src/App.svelte';

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
});

describe('App', () => {
  it('shows the unofficial notice on every route', async () => {
    render(App, { props: { localiser } });
    const notice = localiser.t('footer-unofficial');
    expect(screen.getByTestId('home')).toBeTruthy();
    expect(screen.getByTestId('unofficial-notice').textContent).toBe(notice);

    await goTo('#/join');
    expect(screen.queryByTestId('home')).toBeNull();
    expect(screen.getByTestId('unofficial-notice').textContent).toBe(notice);
    expect(screen.getAllByText(notice)).toHaveLength(1);
  });

  it('opens the address as it is when the app starts, not as it was first loaded', async () => {
    await goTo('#/rejoin');
    render(App, { props: { localiser } });
    expect(screen.getByTestId('rejoin')).toBeTruthy();
  });
});
