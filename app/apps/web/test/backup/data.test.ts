import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import { exportBackup } from '../../src/backup/export.js';
import { resetDeviceStore, setDeviceStore } from '../../src/device-store.js';
import { initSessions, loadOnlineSession, resetSessions } from '../../src/session.js';
import Settings from '../../src/screens/Settings.svelte';
import { setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';
import { openDeviceStore, type DeviceStore } from '../../src/storage/db.js';
import { populate, SERVER } from './fixtures.js';

const localiser = createLocaliser('en');
let store: DeviceStore;

beforeEach(async () => {
  store = await openDeviceStore();
  setDeviceStore(store);
  await initSessions(store);
});

afterEach(() => {
  resetDeviceStore();
  resetSessions();
  setDisplaySettings(DEFAULT_SETTINGS);
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  root.style.removeProperty('--text-scale');
  location.hash = '';
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'canShare');
  Reflect.deleteProperty(navigator, 'share');
});

const open = async (name: string): Promise<HTMLElement> => {
  await userEvent.setup().click(await screen.findByRole('button', { name }));
  return screen.findByRole('alertdialog');
};

describe('export', () => {
  it('backup export warns about seat tokens', async () => {
    render(Settings, { props: { localiser } });
    const dialog = await open('Export');
    expect(dialog.textContent).toMatch(/seat tokens/);
    expect(dialog.textContent).toMatch(/don't share it/);
    expect(dialog.getAttribute('aria-describedby')).not.toBeNull();
  });

  it('saves through the file picker under the dated name', async () => {
    await populate(store);
    const write = vi.fn(() => Promise.resolve());
    const close = vi.fn(() => Promise.resolve());
    const picker = vi.fn(() => Promise.resolve({ createWritable: () => ({ write, close }) }));
    vi.stubGlobal('showSaveFilePicker', picker);
    render(Settings, { props: { localiser } });
    const dialog = await open('Export');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    const [options] = picker.mock.calls[0] as unknown as [{ suggestedName: string }];
    expect(options.suggestedName).toMatch(/^werewolf-duel-backup-\d{8}\.wwdb$/);
    expect(write).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toBeTruthy();
  });

  it('falls back to a download without the file picker', async () => {
    const create = vi.fn(() => 'blob:backup');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(Settings, { props: { localiser } });
    const dialog = await open('Export');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(create).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it('offers Share only where files can be shared', async () => {
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    render(Settings, { props: { localiser } });
    const dialog = await open('Export');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
  });

  it('does not offer Share where it is unavailable', async () => {
    render(Settings, { props: { localiser } });
    const dialog = await open('Export');
    expect(within(dialog).queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('says nothing is kept after the tab closes without persistent storage', async () => {
    render(Settings, { props: { localiser } });
    await screen.findByRole('button', { name: 'Export' });
    expect(store.persistent).toBe(false);
    expect(screen.getByText(/nothing is kept after the tab closes/)).toBeTruthy();
  });
});

describe('import', () => {
  const upload = async (file: File): Promise<void> => {
    const input = await screen.findByTestId('backup-file');
    await userEvent.setup().upload(input, file);
  };

  it('previews the backup and merges only on confirm', async () => {
    const source = await openDeviceStore();
    await populate(source);
    const file = new File([await exportBackup(source)], 'b.wwdb');
    render(Settings, { props: { localiser } });
    await upload(file);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toMatch(/2 finished games/);
    expect(dialog.textContent).toMatch(/2 saved online games/);
    expect(dialog.textContent).toMatch(/differ/);
    expect(await store.history.list()).toEqual([]);

    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Import' }));
    await waitFor(async () => expect(await store.history.list()).toHaveLength(2));
    expect(await store.sessions.list()).toHaveLength(2);
    expect(await store.settings.get()).toEqual(DEFAULT_SETTINGS);
    expect(loadOnlineSession(SERVER, 'AAAAAA')).toBeDefined();
    expect(await screen.findByText(/4 added, 0 updated/)).toBeTruthy();
  });

  it('replaces the settings only when asked', async () => {
    const source = await openDeviceStore();
    await populate(source);
    render(Settings, { props: { localiser } });
    await upload(new File([await exportBackup(source)], 'b.wwdb'));
    const dialog = await screen.findByRole('alertdialog');
    const user = userEvent.setup();
    await user.click(within(dialog).getByRole('checkbox', { name: /Replace my settings/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));
    await waitFor(async () => expect((await store.settings.get()).theme).toBe('dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('cancelling the preview changes nothing', async () => {
    const source = await openDeviceStore();
    await populate(source);
    render(Settings, { props: { localiser } });
    await upload(new File([await exportBackup(source)], 'b.wwdb'));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await store.history.list()).toEqual([]);
  });

  it('shows why a file was refused and changes nothing', async () => {
    render(Settings, { props: { localiser } });
    await upload(new File([new Uint8Array([1, 2, 3])], 'bad.wwdb'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/not a readable backup/);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await store.history.list()).toEqual([]);
  });
});

describe('clear history and delete all', () => {
  it('dialog names what will be deleted', async () => {
    render(Settings, { props: { localiser } });
    const everything = await open('Delete all data');
    expect(everything.textContent).toMatch(/Settings and your display name/);
    expect(everything.textContent).toMatch(/Match history and stats/);
    expect(everything.textContent).toMatch(/Paused and active games, which can't be resumed/);
    expect(everything.textContent).toMatch(/this device only/);
    expect(everything.textContent).toMatch(/online rooms expire on their own/);
    expect(within(everything).getByRole('button', { name: 'Export backup first' })).toBeTruthy();
    const confirm = within(everything).getByRole('button', { name: 'Delete all data' });
    expect(confirm.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    await userEvent.setup().click(within(everything).getByRole('button', { name: 'Cancel' }));

    const history = await open('Clear history');
    expect(history.textContent).toMatch(/Match history and stats/);
    expect(history.textContent).not.toMatch(/can't be resumed/);
    expect(history.textContent).toMatch(/this device only/);
    expect(within(history).getByRole('button', { name: 'Export backup first' })).toBeTruthy();
    expect(
      within(history).getByRole('button', { name: 'Clear history' }).querySelector('svg'),
    ).not.toBeNull();
  });

  it('cancelling deletes nothing', async () => {
    await populate(store);
    render(Settings, { props: { localiser } });
    const dialog = await open('Delete all data');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(await store.history.list()).toHaveLength(2);
  });

  it('clear history keeps sessions', async () => {
    await populate(store);
    render(Settings, { props: { localiser } });
    const dialog = await open('Clear history');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Clear history' }));
    await waitFor(async () => expect(await store.history.list()).toEqual([]));
    expect(await store.sessions.list()).toHaveLength(2);
    expect((await store.settings.get()).theme).toBe('dark');
    expect((await store.identity.get()).displayName).toBe('Mika');
    expect(await screen.findByText('History cleared.')).toBeTruthy();
  });

  it('delete all returns to first run', async () => {
    await populate(store);
    await initSessions(store);
    location.hash = '#/settings';
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(loadOnlineSession(SERVER, 'AAAAAA')).toBeDefined();
    render(Settings, { props: { localiser } });
    const dialog = await open('Delete all data');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Delete all data' }));
    await waitFor(() => expect(location.hash).toBe('#/'));
    expect(await store.history.list()).toEqual([]);
    expect(await store.sessions.list()).toEqual([]);
    expect(await store.settings.get()).toEqual(DEFAULT_SETTINGS);
    expect((await store.identity.get()).displayName).toBeUndefined();
    expect(loadOnlineSession(SERVER, 'AAAAAA')).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1');
  });

  it('delete all removes the legacy seat tokens from localStorage', async () => {
    localStorage.setItem('wwd.online.OLD', '{"room":"OLD"}');
    localStorage.setItem('other', 'kept');
    render(Settings, { props: { localiser } });
    const dialog = await open('Delete all data');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Delete all data' }));
    await waitFor(() => expect(location.hash).toBe('#/'));
    expect(localStorage.getItem('wwd.online.OLD')).toBeNull();
    expect(localStorage.getItem('other')).toBe('kept');
    localStorage.clear();
  });

  it('export first saves a backup and keeps the dialog open', async () => {
    await populate(store);
    const close = vi.fn(() => Promise.resolve());
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn(() => Promise.resolve({ createWritable: () => ({ write: vi.fn(), close }) })),
    );
    render(Settings, { props: { localiser } });
    const dialog = await open('Delete all data');
    await userEvent
      .setup()
      .click(within(dialog).getByRole('button', { name: 'Export backup first' }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(await within(dialog).findByRole('status')).toBeTruthy();
    expect(await store.history.list()).toHaveLength(2);
  });
});
