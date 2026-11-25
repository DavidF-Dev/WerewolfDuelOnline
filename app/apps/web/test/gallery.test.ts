import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { render, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import { resetDeviceStore } from '../src/device-store.js';
import { GALLERY, type GalleryEntry } from '../src/gallery/entries.js';
import Gallery from '../src/gallery/Gallery.svelte';
import type { PageName } from '../src/router.js';
import About from '../src/screens/About.svelte';
import CharacterReference from '../src/screens/CharacterReference.svelte';
import CreateOnline from '../src/screens/CreateOnline.svelte';
import History from '../src/screens/History.svelte';
import Home from '../src/screens/Home.svelte';
import Host from '../src/screens/Host.svelte';
import Join from '../src/screens/Join.svelte';
import JoinOnline from '../src/screens/JoinOnline.svelte';
import Rejoin from '../src/screens/Rejoin.svelte';
import Replay from '../src/screens/Replay.svelte';
import Settings from '../src/screens/Settings.svelte';
import Stats from '../src/screens/Stats.svelte';
import { resetSessions } from '../src/session.js';

const localiser = createLocaliser('en');
const WEB_ROOT = process.cwd();

/** The screen each route shows; typed by route so that a new route must be added here. */
const SCREENS: Record<PageName, Component<any>> = {
  home: Home,
  'local-host': Host,
  'local-join': Join,
  'online-new': CreateOnline,
  settings: Settings,
  about: About,
  'how-to-play': CharacterReference,
  history: History,
  stats: Stats,
  replay: Replay,
  join: JoinOnline,
  rejoin: Rejoin,
};

/** Each dialog, sheet, banner and prompt: the entry that shows it, and what proves it is shown. */
const OVERLAYS: Readonly<Record<string, { entry: string; selector: string }>> = {
  BackupPreview: { entry: 'backup-import', selector: '[data-testid="confirm-dialog"] ul' },
  ConfirmDialog: { entry: 'backup-export', selector: '[data-testid="confirm-dialog"]' },
  ConnectionBanner: { entry: 'connection-banners', selector: '[data-testid="connection-banner"]' },
  ContinueElsewhere: {
    entry: 'table-continue-elsewhere',
    selector: '[data-testid="continue-elsewhere"][open]',
  },
  DeleteDataDialog: { entry: 'delete-all', selector: '[data-testid="confirm-dialog"]' },
  DisplayNamePrompt: { entry: 'display-name', selector: '[data-testid="display-name"]' },
  GameMenu: { entry: 'table-menu', selector: '[data-testid="game-menu"][open]' },
  GameOver: { entry: 'game-over', selector: '[data-testid="game-over"]' },
  InstallCard: { entry: 'home', selector: '[data-testid="install-card"]' },
  InvitePanel: { entry: 'invite-waiting', selector: '[data-testid="invite"]' },
  LogDrawer: { entry: 'table-log', selector: '[data-testid="log-drawer"][open]' },
  PausedPanel: { entry: 'table-paused', selector: '[data-testid="pause-panel"]' },
  PlanSheet: { entry: 'table-plan-seal', selector: '[data-testid="confirm-dialog"]' },
  Replay: { entry: 'replay-menu', selector: '[data-testid="replay-menu"][open]' },
  RejoinRequest: { entry: 'table-rejoin-request', selector: '[data-testid="confirm-dialog"]' },
  RemoveGameDialog: { entry: 'home-remove', selector: '[data-testid="confirm-dialog"]' },
  ResignButton: { entry: 'table-resign', selector: '[data-testid="confirm-dialog"]' },
  Settings: { entry: 'backup-export', selector: '[data-testid="confirm-dialog"]' },
  ServerConfirm: { entry: 'server-confirm', selector: '[data-testid="server-confirm"]' },
  UpdateBanner: { entry: 'update-banner', selector: '[data-testid="update-banner"] button' },
};

/**
 * The components that open a dialog or a details sheet or are named as banners, and the screens
 * that open a dialog themselves: every one of them must be in `OVERLAYS`.
 */
async function overlayComponents(): Promise<string[]> {
  const part = (source: string, file: string): boolean =>
    /<dialog|<(Confirm)?Dialog|<Sheet|<details/.test(source) || file.endsWith('Banner.svelte');
  const screen = (source: string): boolean => /<dialog|<(Confirm)?Dialog|<Sheet/.test(source);
  const rules: Array<[string, (source: string, file: string) => boolean]> = [
    ['components', part],
    ['table', part],
    ['screens', screen],
  ];
  const found: string[] = [];
  for (const [dir, overlay] of rules) {
    const path = join(WEB_ROOT, 'src', dir);
    for (const file of await readdir(path)) {
      if (!file.endsWith('.svelte')) continue;
      if (overlay(await readFile(join(path, file), 'utf8'), file)) {
        found.push(file.replace(/\.svelte$/, ''));
      }
    }
  }
  return found.sort();
}

const shows = (entry: GalleryEntry, screen: Component<any>): boolean =>
  entry.render === screen || entry.props['screen'] === screen;

/** This process's environment without what the test runner adds, which would change the build. */
function productionEnv(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !/^(VITEST|NODE_ENV$|TEST$|MODE$)/.test(name)),
  );
  return { ...env, BASE_PATH: '' };
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

afterEach(() => {
  resetDeviceStore();
  resetSessions();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('gallery', () => {
  it('entries cover every route and dialog', async () => {
    const ids = GALLERY.map((entry) => entry.id);
    expect(new Set(ids).size, 'entry ids are unique').toBe(ids.length);
    for (const [route, screen] of Object.entries(SCREENS)) {
      expect(
        GALLERY.some((entry) => shows(entry, screen)),
        `the ${route} route`,
      ).toBe(true);
    }
    expect(Object.keys(OVERLAYS)).toEqual(expect.arrayContaining(await overlayComponents()));
    for (const [component, { entry }] of Object.entries(OVERLAYS)) {
      expect(ids, `${component} is shown by a gallery entry`).toContain(entry);
    }
  });

  it('every entry renders without errors', { timeout: 120_000 }, async () => {
    const network = vi.fn(() => {
      throw new Error('the gallery made a network call');
    });
    vi.stubGlobal('fetch', network);
    vi.stubGlobal('WebSocket', network);
    const errors = vi.spyOn(console, 'error');
    for (const entry of GALLERY) {
      const { unmount } = render(Gallery, { props: { localiser, id: entry.id } });
      await waitFor(
        () => expect(document.documentElement.dataset['galleryReady'], entry.id).toBe(entry.id),
        { timeout: 10_000 },
      );
      expect(document.documentElement.dataset['galleryError'], entry.id).toBeUndefined();
      for (const [component, overlay] of Object.entries(OVERLAYS)) {
        if (overlay.entry !== entry.id) continue;
        expect(document.querySelector(overlay.selector), `${entry.id} shows ${component}`).not.toBe(
          null,
        );
      }
      unmount();
    }
    expect(network).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  it('the invite entry waits without offering to continue on another device', async () => {
    render(Gallery, { props: { localiser, id: 'invite-waiting' } });
    await waitFor(() =>
      expect(document.documentElement.dataset['galleryReady']).toBe('invite-waiting'),
    );
    expect(document.querySelector('[data-testid="invite"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="continue-elsewhere"]')).toBeNull();
  });

  it('gallery is absent from the production bundle', { timeout: 300_000 }, async () => {
    const require = createRequire(join(WEB_ROOT, 'package.json'));
    const vite = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
    const out = await mkdtemp(join(tmpdir(), 'wwd-production-build-'));
    try {
      await promisify(execFile)(
        process.execPath,
        [vite, 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'],
        { cwd: WEB_ROOT, env: productionEnv() },
      );
      const files = await filesUnder(out);
      expect(files.length).toBeGreaterThan(0);
      expect(files.filter((file) => /gallery/i.test(file))).toEqual([]);
      const texts = await Promise.all(
        files.filter((file) => /\.(html|js|css)$/.test(file)).map((file) => readFile(file, 'utf8')),
      );
      const bundle = texts.join('\n');
      expect(bundle).not.toContain('dev/gallery');
      for (const entry of GALLERY) expect(bundle, entry.id).not.toContain(entry.title);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});
