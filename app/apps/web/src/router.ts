import { readable, type Readable } from 'svelte/store';
import type { Seat } from '@wwd/engine';

export type Route =
  | { name: 'home' }
  | { name: 'local-host' }
  /** `code` is as written in the address, not yet checked. */
  | { name: 'local-join'; code?: string }
  | { name: 'online-new' }
  | { name: 'settings' }
  | { name: 'about' }
  | { name: 'how-to-play' }
  | { name: 'history' }
  | { name: 'stats' }
  /** `id` is a history record's id, decoded. */
  | { name: 'replay'; id: string }
  /** `code` and `server` are as written in the address, not yet checked. */
  | { name: 'join'; code?: string; server?: string; seat?: Seat }
  | { name: 'rejoin'; code?: string; seat?: Seat; server?: string }
  /** Development builds only: a gallery entry by its id, or the list of entries when null. */
  | { name: 'gallery'; id: string | null };

export type RouteName = Route['name'];

/** The routes the app links to; the gallery has no address in production builds. */
export type PageName = Exclude<RouteName, 'gallery'>;

const STATIC: Readonly<Record<string, Exclude<PageName, 'replay'>>> = {
  '#/local/host': 'local-host',
  '#/local/join': 'local-join',
  '#/online/new': 'online-new',
  '#/settings': 'settings',
  '#/about': 'about',
  '#/how-to-play': 'how-to-play',
  '#/history': 'history',
  '#/stats': 'stats',
  '#/join': 'join',
  '#/rejoin': 'rejoin',
};

const PATHS: Readonly<Record<PageName, string>> = {
  home: '#/',
  'local-host': '#/local/host',
  'local-join': '#/local/join',
  'online-new': '#/online/new',
  settings: '#/settings',
  about: '#/about',
  'how-to-play': '#/how-to-play',
  history: '#/history',
  stats: '#/stats',
  replay: '#/history',
  join: '#/join',
  rejoin: '#/rejoin',
};

const JOIN_WITH_CODE = /^#\/join\/([^/]+)$/;
const REPLAY_WITH_ID = /^#\/history\/([^/]+)$/;

/** Reads a route from `hash`, such as `#/join/K7Q2MX?server=…`; anything unknown is home. */
export function routeFor(hash: string): Route {
  const mark = hash.indexOf('?');
  const path = mark === -1 ? hash : hash.slice(0, mark);
  const params = new URLSearchParams(mark === -1 ? '' : hash.slice(mark + 1));
  const server = params.get('server') ?? undefined;
  const withServer = server === undefined ? {} : { server };
  const seat = params.get('seat');
  const withSeat: { seat?: Seat } = seat === 'p0' || seat === 'p1' ? { seat } : {};
  if (import.meta.env.DEV) {
    const gallery = /^#\/dev\/gallery(?:\/([^/]+))?$/.exec(path);
    if (gallery !== null) return { name: 'gallery', id: gallery[1] ?? null };
  }
  const joinCode = JOIN_WITH_CODE.exec(path)?.[1];
  if (joinCode !== undefined) return { name: 'join', code: joinCode, ...withServer, ...withSeat };
  const replayId = REPLAY_WITH_ID.exec(path)?.[1];
  if (replayId !== undefined) {
    try {
      return { name: 'replay', id: decodeURIComponent(replayId) };
    } catch {
      return { name: 'history' };
    }
  }
  const name = STATIC[path];
  if (name === 'join') return { name, ...withServer };
  const code = params.get('code') ?? undefined;
  const withCode = code === undefined ? {} : { code };
  if (name === 'local-join') return { name, ...withCode };
  if (name === 'rejoin') return { name, ...withCode, ...withSeat, ...withServer };
  return { name: name ?? 'home' };
}

/** The current route, following `location.hash`. */
export const route: Readable<Route> = readable(routeFor(location.hash), (set) => {
  const update = (): void => set(routeFor(location.hash));
  // The address may have changed while nothing was following it.
  update();
  window.addEventListener('hashchange', update);
  return () => window.removeEventListener('hashchange', update);
});

/** The address of the replay of history record `id`. */
export const replayHref = (id: string): string => `#/history/${encodeURIComponent(id)}`;

/** The address that joins local room `code` in this browser. */
export const localJoinHash = (code: string): string =>
  `${PATHS['local-join']}?code=${encodeURIComponent(code)}`;

export const hrefFor = (name: PageName): string => PATHS[name];

export function navigate(name: PageName): void {
  location.hash = hrefFor(name);
}

// Set once the address changes after the page loads, which means there is an earlier screen to go back to.
let navigatedInApp = false;
window.addEventListener('hashchange', () => {
  navigatedInApp = true;
});

/** Returns to the previous screen, or to home when this page was opened on the current one. */
export function goBack(): void {
  if (navigatedInApp) history.back();
  else navigate('home');
}
