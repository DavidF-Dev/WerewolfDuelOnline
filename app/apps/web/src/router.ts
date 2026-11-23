import { readable, type Readable } from 'svelte/store';
import type { Seat } from '@wwd/engine';

export type Route =
  | { name: 'home' }
  | { name: 'local-host' }
  | { name: 'local-join' }
  | { name: 'online-new' }
  /** `code` and `server` are as written in the address, not yet checked. */
  | { name: 'join'; code?: string; server?: string }
  | { name: 'rejoin'; code?: string; seat?: Seat; server?: string };

export type RouteName = Route['name'];

const STATIC: Readonly<Record<string, RouteName>> = {
  '#/local/host': 'local-host',
  '#/local/join': 'local-join',
  '#/online/new': 'online-new',
  '#/join': 'join',
  '#/rejoin': 'rejoin',
};

const PATHS: Readonly<Record<RouteName, string>> = {
  home: '#/',
  'local-host': '#/local/host',
  'local-join': '#/local/join',
  'online-new': '#/online/new',
  join: '#/join',
  rejoin: '#/rejoin',
};

const JOIN_WITH_CODE = /^#\/join\/([^/]+)$/;

/** Reads a route from `hash`, such as `#/join/K7Q2MX?server=…`; anything unknown is home. */
export function routeFor(hash: string): Route {
  const mark = hash.indexOf('?');
  const path = mark === -1 ? hash : hash.slice(0, mark);
  const params = new URLSearchParams(mark === -1 ? '' : hash.slice(mark + 1));
  const server = params.get('server') ?? undefined;
  const withServer = server === undefined ? {} : { server };
  const joinCode = JOIN_WITH_CODE.exec(path)?.[1];
  if (joinCode !== undefined) return { name: 'join', code: joinCode, ...withServer };
  const name = STATIC[path];
  if (name === 'join') return { name, ...withServer };
  if (name === 'rejoin') {
    const code = params.get('code') ?? undefined;
    const seat = params.get('seat');
    return {
      name,
      ...(code === undefined ? {} : { code }),
      ...(seat === 'p0' || seat === 'p1' ? { seat } : {}),
      ...withServer,
    };
  }
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

export const hrefFor = (name: RouteName): string => PATHS[name];

export function navigate(name: RouteName): void {
  location.hash = hrefFor(name);
}
