import { getContext, setContext, type Snippet } from 'svelte';

const KEY = Symbol('app-banner');

/** Shows `banner` under the bar of every screen inside the calling component, such as an update notice. */
export function provideAppBanner(banner: Snippet): void {
  setContext(KEY, banner);
}

/** The banner every screen shows under its bar, if one was provided. */
export const appBanner = (): Snippet | undefined => getContext<Snippet | undefined>(KEY);
