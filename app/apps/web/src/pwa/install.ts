import { writable, type Readable } from 'svelte/store';

/**
 * How this browser can install the app: from its own prompt (`prompt`), from the Share menu on
 * iOS Safari (`ios`), not at all because it is already running installed (`installed`), or not at
 * all (`unavailable`).
 */
export type InstallState = 'prompt' | 'ios' | 'installed' | 'unavailable';

/** The `beforeinstallprompt` event, which only Chromium-based browsers send. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let offer: InstallPromptEvent | null = null;
let installedNow = false;
const current = writable<InstallState>('unavailable');

/** The install state, kept up to date as the browser offers or completes an install. */
export const install: Readable<InstallState> = { subscribe: current.subscribe };

function runningStandalone(): boolean {
  const media =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return media || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Safari on an iPhone or iPad; iPadOS reports itself as a Mac with a touch screen. */
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const apple =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return apple && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function installState(): InstallState {
  if (installedNow || runningStandalone()) return 'installed';
  if (offer !== null) return 'prompt';
  if (isIosSafari()) return 'ios';
  return 'unavailable';
}

const refresh = (): void => current.set(installState());

/**
 * Keeps the browser's install offer for the Install buttons; call once at start-up, since the
 * offer can arrive before any screen asks for it. Returns a function that stops listening.
 */
export function listenForInstall(): () => void {
  const offered = (event: Event): void => {
    // Holding the offer replaces the browser's own install banner with ours.
    event.preventDefault();
    offer = event as InstallPromptEvent;
    refresh();
  };
  const installed = (): void => {
    offer = null;
    installedNow = true;
    refresh();
  };
  window.addEventListener('beforeinstallprompt', offered);
  window.addEventListener('appinstalled', installed);
  refresh();
  return () => {
    window.removeEventListener('beforeinstallprompt', offered);
    window.removeEventListener('appinstalled', installed);
    offer = null;
    installedNow = false;
  };
}

/** Shows the browser's install prompt, which can be used only once; true if the player accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = offer;
  if (event === null) return false;
  offer = null;
  try {
    await event.prompt();
    return (await event.userChoice).outcome === 'accepted';
  } catch {
    return false;
  } finally {
    refresh();
  }
}
