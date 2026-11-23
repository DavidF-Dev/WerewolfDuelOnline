import { LOCAL_CHANNEL } from '@wwd/transport';

/** The channel for one room, so that each host tab only hears its own guests. */
export const channelFor = (room: string): string => `${LOCAL_CHANNEL}-${room}`;

const lockName = (room: string): string => `wwd-host-${room}`;

const locksAvailable = (): boolean => typeof navigator !== 'undefined' && 'locks' in navigator;

/**
 * Marks this page as the host of `room` until the returned function is called or the page closes.
 * The browser releases a page's Web Locks when the page goes away, even when no unload event runs.
 */
export function holdHostLock(room: string): () => void {
  if (!locksAvailable()) return () => {};
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  void navigator.locks.request(lockName(room), () => held);
  return release;
}

/** Whether a page in this browser hosts `room`; true when that cannot be checked. */
export async function isHosted(room: string): Promise<boolean> {
  if (!locksAvailable()) return true;
  try {
    const { held = [] } = await navigator.locks.query();
    return held.some((lock) => lock.name === lockName(room));
  } catch {
    return true;
  }
}

/** Calls `onGone` once the page hosting `room` closes; returns a function that stops watching. */
export function watchHost(room: string, onGone: () => void): () => void {
  if (!locksAvailable()) return () => {};
  const controller = new AbortController();
  navigator.locks
    .request(lockName(room), { signal: controller.signal }, () => {
      if (!controller.signal.aborted) onGone();
    })
    .catch(() => {
      // Aborted by the returned function.
    });
  return () => controller.abort();
}
