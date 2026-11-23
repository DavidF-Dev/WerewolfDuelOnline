import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import { defaultRulesConfig } from '@wwd/engine';
import { MemoryReferee } from '@wwd/referee-memory';
import { createInMemoryPair } from '@wwd/transport';
import UpdateBanner from '../../src/components/UpdateBanner.svelte';
import { watchForUpdates, type UpdateHooks } from '../../src/pwa/update.js';
import JoinOnline from '../../src/screens/JoinOnline.svelte';
import { resetSessions } from '../../src/session.js';
import { FakeWebSocket } from '../fake-socket.js';

const localiser = createLocaliser('en');

/** Watches a fake service worker registration; `update` finds a new version when `found`. */
function fakeWorker(found: boolean) {
  let hooks: UpdateHooks | undefined;
  const updateSW = vi.fn((_reload?: boolean) => Promise.resolve());
  const registration = {
    installing: null as object | null,
    waiting: null as object | null,
    update: vi.fn(() => {
      if (found) {
        registration.waiting = {};
        hooks?.onNeedRefresh();
      }
      return Promise.resolve();
    }),
  };
  watchForUpdates((given) => {
    hooks = given;
    given.onRegisteredSW('sw.js', registration as unknown as ServiceWorkerRegistration);
    return updateSW;
  });
  return {
    updateSW,
    registration,
    newVersionWaiting: () => hooks?.onNeedRefresh(),
  };
}

let referee: MemoryReferee | undefined;

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  referee?.close();
  referee = undefined;
  vi.unstubAllGlobals();
  resetSessions();
  location.hash = '';
});

describe('UpdateBanner', () => {
  it('announces a waiting version and reloads into it', async () => {
    const worker = fakeWorker(false);
    render(UpdateBanner, { props: { localiser } });
    const region = screen.getByRole('region', { name: 'App updates' });
    const status = within(region).getByRole('status');
    expect(status.textContent).toBe('');
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();

    worker.newVersionWaiting();
    await waitFor(() => expect(status.textContent).toBe('A new version is available'));
    await userEvent.setup().click(within(region).getByRole('button', { name: 'Reload' }));
    expect(worker.updateSW).toHaveBeenCalledWith(true);
  });
});

describe('protocol version stop', () => {
  it('stale page is told to reload', async () => {
    const worker = fakeWorker(true);
    referee = new MemoryReferee();
    const code = referee.createRoom(defaultRulesConfig());
    const [page, refereeEnd] = createInMemoryPair();
    referee.accept(refereeEnd);

    render(JoinOnline, { props: { localiser, code } });
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0]!;
    // This page speaks protocol 1, as a page loaded before the referee was updated would.
    socket.send = (text: string) =>
      page.send(JSON.stringify({ ...(JSON.parse(text) as object), protocol_version: 1 }));
    page.onMessage((text) => socket.onmessage?.({ data: text }));
    page.onClose(() => socket.onclose?.({ code: 1008, reason: '' }));
    socket.accept();

    const stopped = await screen.findByTestId('connection-stopped');
    expect(stopped.textContent).toContain(localiser.t('stop-protocol-version'));
    const banner = screen.getByTestId('connection-banner');
    await userEvent.setup().click(within(banner).getByRole('button', { name: 'Reload' }));
    expect(worker.registration.update).toHaveBeenCalledOnce();
    await waitFor(() => expect(worker.updateSW).toHaveBeenCalledWith(true));
  });
});
