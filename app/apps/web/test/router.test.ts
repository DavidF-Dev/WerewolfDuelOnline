import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { hrefFor, localJoinHash, routeFor } from '../src/router.js';
import { RULES_SECTIONS, rulesHref } from '../src/rules/sections.js';

describe('routes', () => {
  it('local join takes an optional code', () => {
    expect(routeFor('#/local/join')).toEqual({ name: 'local-join' });
    expect(routeFor('#/local/join?code=K7Q2MX')).toEqual({ name: 'local-join', code: 'K7Q2MX' });
    expect(routeFor(localJoinHash('K7Q2MX'))).toEqual({ name: 'local-join', code: 'K7Q2MX' });
  });

  it('each rules section has a route of its own', () => {
    expect(routeFor('#/rules/round')).toEqual({ name: 'rules', section: 'round' });
    for (const section of RULES_SECTIONS) {
      expect(routeFor(rulesHref(section))).toEqual({ name: 'rules', section });
    }
  });

  it('an unknown rules section opens How to play', () => {
    expect(routeFor('#/rules/nope')).toEqual({ name: 'how-to-play' });
    expect(routeFor('#/rules')).toEqual({ name: 'how-to-play' });
  });

  it('the How to play address still opens How to play', () => {
    expect(routeFor('#/how-to-play')).toEqual({ name: 'how-to-play' });
  });

  it('the tutorial has a route of its own', () => {
    expect(routeFor('#/tutorial')).toEqual({ name: 'tutorial' });
    expect(hrefFor('tutorial')).toBe('#/tutorial');
  });

  it('a page opened on the tutorial opens How to play instead', async () => {
    location.hash = '#/tutorial';
    vi.resetModules();
    const router = await import('../src/router.js');
    expect(location.hash).toBe('#/how-to-play');
    expect(get(router.route)).toEqual({ name: 'how-to-play' });
    location.hash = '';
  });
});
