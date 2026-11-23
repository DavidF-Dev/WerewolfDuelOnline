import type { Localiser } from '@wwd/client-core';

/**
 * The current time, refreshed each second while `until()` names a time still to come and the
 * page is visible; no timer runs otherwise. Call it while a component initialises.
 */
export function liveNow(until: () => number | null | undefined): { readonly current: number } {
  let now = $state(Date.now());
  let visible = $state(document.visibilityState === 'visible');

  $effect(() => {
    const update = (): void => {
      visible = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  });

  $effect(() => {
    const end = until();
    if (end === null || end === undefined || !visible) return;
    now = Date.now();
    if (now >= end) return;
    const timer = setInterval(() => {
      now = Date.now();
      if (now >= end) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  });

  return {
    get current() {
      return now;
    },
  };
}

/** The time from `now` until `end` as minutes and seconds, such as `9:41`; never negative. */
export function countdownText(l: Localiser, end: number, now: number): string {
  const total = Math.max(0, Math.ceil((end - now) / 1000));
  return l.t('countdown', { minutes: Math.floor(total / 60), seconds: total % 60 });
}
