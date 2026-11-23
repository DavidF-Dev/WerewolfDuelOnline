import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import CreateOnline from '../src/screens/CreateOnline.svelte';
import { DEFAULT_SERVER } from '../src/online.js';

const localiser = createLocaliser('en');

afterEach(() => {
  vi.unstubAllGlobals();
  location.hash = '';
});

describe('CreateOnline', () => {
  it('posts the selected grace and navigates with the code', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 'K7Q2MX' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(CreateOnline, { props: { localiser } });
    const user = userEvent.setup();

    expect(screen.getByRole('radio', { name: '10 minutes' })).toHaveProperty('checked', true);
    await user.click(screen.getByRole('radio', { name: '30 minutes' }));
    await user.click(screen.getByRole('button', { name: 'Create the game' }));

    await waitFor(() => expect(location.hash).toBe('#/join/K7Q2MX'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_SERVER}/rooms`);
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as { grace_minutes: number; config: unknown };
    expect(body.grace_minutes).toBe(30);
    expect(body.config).toEqual({
      tiebreak: 'hourglasses_then_badge',
      min_targets: 1,
      badge_start: 'random',
    });
  });

  it('explains a refusal and stays on the form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 })),
    );
    render(CreateOnline, { props: { localiser } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create the game' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(localiser.t('create-failed-rate-limited'));
    expect(location.hash).toBe('');
  });
});
