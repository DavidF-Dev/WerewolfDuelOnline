import { describe, expect, it } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import { describeWhen } from '../src/when.js';

const NOW = Date.UTC(2026, 10, 23, 18, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const locale = createLocaliser('en').locale;

describe('describeWhen', () => {
  it('uses the localiser locale', () => {
    expect(locale).toBe('en-GB');
  });

  it('says how long ago in seconds, minutes and hours', () => {
    expect(describeWhen(NOW - 30_000, NOW, locale)).toBe('30 seconds ago');
    expect(describeWhen(NOW - 2 * MINUTE, NOW, locale)).toBe('2 minutes ago');
    expect(describeWhen(NOW - 3 * HOUR, NOW, locale)).toBe('3 hours ago');
  });

  it('gives the date from a day on', () => {
    expect(describeWhen(Date.UTC(2026, 10, 21, 12, 0), NOW, locale)).toBe('21 Nov');
    expect(describeWhen(Date.UTC(2025, 10, 21, 12, 0), NOW, locale)).toBe('21 Nov 2025');
  });

  it('never reads from the future', () => {
    expect(describeWhen(NOW + HOUR, NOW, locale)).toBe('0 seconds ago');
  });
});
