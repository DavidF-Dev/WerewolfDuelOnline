const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;
const DAY_S = 24 * HOUR_S;

/** How long before `now` a moment was, as a relative time within the day and as a date after. */
export function describeWhen(at: number, now: number, locale: string): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < DAY_S) {
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
    if (seconds < MINUTE_S) return relative.format(-seconds, 'second');
    if (seconds < HOUR_S) return relative.format(-Math.floor(seconds / MINUTE_S), 'minute');
    return relative.format(-Math.floor(seconds / HOUR_S), 'hour');
  }
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(at);
}
