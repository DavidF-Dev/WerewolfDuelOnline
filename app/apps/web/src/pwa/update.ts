import { get, writable, type Readable } from 'svelte/store';
import type { StopReason } from '@wwd/client-core';

/** The service worker callbacks that `watchForUpdates` needs. */
export interface UpdateHooks {
  onNeedRefresh(): void;
  onRegisteredSW(url: string, registration: ServiceWorkerRegistration | undefined): void;
}

/** Registers the service worker; the result activates a waiting version and reloads into it. */
export type RegisterUpdates = (hooks: UpdateHooks) => (reloadPage?: boolean) => Promise<void>;

/** How long a reload waits for a newly found version to finish installing. */
const INSTALL_WAIT_MS = 10_000;

const waiting = writable(false);
let activate: ((reloadPage?: boolean) => Promise<void>) | undefined;
let registration: ServiceWorkerRegistration | undefined;
let announced = false;

/** True once a new version of the app is installed and waiting for this page to reload. */
export const updateWaiting: Readable<boolean> = { subscribe: waiting.subscribe };

/** Whether a banner has already announced the waiting version, so that later banners show it quietly. */
export const updateAnnounced = (): boolean => announced;

/** Records that the waiting version has been announced. */
export function markUpdateAnnounced(): void {
  announced = true;
}

/** Registers the service worker through `register` and watches it for new versions. */
export function watchForUpdates(register: RegisterUpdates): void {
  waiting.set(false);
  announced = false;
  registration = undefined;
  activate = register({
    onNeedRefresh: () => waiting.set(true),
    onRegisteredSW: (_url, found) => {
      registration = found;
    },
  });
}

/** True when the referee refused this page because it speaks an older protocol. */
export const isStalePage = (reason: StopReason | null, lastError: string | null): boolean =>
  reason === 'protocol_version' || (reason === 'rejected' && lastError === 'protocol_version');

/** Resolves once a new version is waiting, or after `INSTALL_WAIT_MS` or a failed install. */
function newVersionInstalled(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let stopWatching = (): void => {};
    const finish = (): void => {
      settled = true;
      clearTimeout(timer);
      stopWatching();
      worker.removeEventListener('statechange', changed);
      resolve();
    };
    const changed = (): void => {
      if (worker.state === 'redundant') finish();
    };
    const timer = setTimeout(finish, INSTALL_WAIT_MS);
    worker.addEventListener('statechange', changed);
    stopWatching = waiting.subscribe((ready) => {
      if (ready) finish();
    });
    if (settled) stopWatching();
  });
}

/**
 * Reloads into the newest version of the app. A page that has not yet seen one checks for it
 * first, since a plain reload would be served the cached version again.
 */
export async function reloadApp(): Promise<void> {
  if (!get(waiting) && registration !== undefined) {
    try {
      await registration.update();
      if (registration.installing !== null) await newVersionInstalled(registration.installing);
    } catch {
      // Without a newer version the page reloads as it is.
    }
  }
  if (get(waiting) && activate !== undefined) await activate(true);
  else location.reload();
}
