import { describe, expect, it } from 'vitest';
import { RULES_SECTIONS, neighbours, rulesHref } from '../../src/rules/sections.js';

describe('rules sections', () => {
  it('lists the six sections in reading order', () => {
    expect(RULES_SECTIONS).toEqual([
      'goal',
      'setup',
      'round',
      'markers',
      'characters',
      'fine-points',
    ]);
  });

  it('the first section has no previous one and the last no next one', () => {
    expect(neighbours('goal')).toEqual({ previous: null, next: 'setup' });
    expect(neighbours('round')).toEqual({ previous: 'setup', next: 'markers' });
    expect(neighbours('fine-points').next).toBeNull();
    expect(neighbours('fine-points').previous).toBe('characters');
  });

  it('links each section by its own address', () => {
    expect(rulesHref('fine-points')).toBe('#/rules/fine-points');
  });
});
