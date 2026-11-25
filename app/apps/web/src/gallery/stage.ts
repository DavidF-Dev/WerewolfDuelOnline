import { getContext, setContext } from 'svelte';
import type { Localiser } from '@wwd/client-core';

/** Prepares the page before an entry mounts; may return a function that undoes it. */
export type Stage = () => Promise<(() => void) | void> | (() => void) | void;

/** Brings a mounted entry to the moment it shows, such as by opening a dialog. */
export type Act = (l: Localiser) => Promise<void>;

type Track = (work: () => Promise<void>) => void;

const KEY = Symbol('gallery-staging');

/** Lets the entries inside this component report the work they do before they are ready. */
export const provideStaging = (track: Track): void => {
  setContext(KEY, track);
};

/** Runs `work`, reporting it to the gallery when there is one. */
export function trackStaging(work: () => Promise<void>): void {
  const track = getContext<Track | undefined>(KEY);
  if (track === undefined) void work();
  else track(work);
}

const WAIT_MS = 5000;
const POLL_MS = 16;

/** Resolves with what `find` returns once it is neither null nor undefined. */
export async function until<T>(find: () => T | null | undefined, what: string): Promise<T> {
  // Counts its tries rather than reading the clock, which the gallery stops.
  for (let waited = 0; waited <= WAIT_MS; waited += POLL_MS) {
    const found = find();
    if (found !== null && found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`the gallery never found ${what}`);
}

export const byTestId = (id: string): Promise<HTMLElement> =>
  until(() => document.querySelector<HTMLElement>(`[data-testid="${id}"]`), id);

export const present = (id: string): boolean =>
  document.querySelector(`[data-testid="${id}"]`) !== null;

export async function click(id: string): Promise<void> {
  (await byTestId(id)).click();
}

/** Clicks the button whose text includes `text`. */
export async function clickButton(text: string): Promise<void> {
  const button = await until(
    () =>
      Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.includes(text) === true,
      ),
    `the ${text} button`,
  );
  button.click();
}

export async function open(id: string): Promise<void> {
  const details = await byTestId(id);
  if (details instanceof HTMLDetailsElement) details.open = true;
}

/** Steps the showdown until it has shown every step. */
export async function stepShowdown(): Promise<void> {
  for (let step = 0; step < 50 && present('showdown-next'); step++) {
    await click('showdown-next');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
