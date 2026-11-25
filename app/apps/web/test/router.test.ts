import { describe, expect, it } from 'vitest';
import { localJoinHash, routeFor } from '../src/router.js';

describe('routes', () => {
  it('local join takes an optional code', () => {
    expect(routeFor('#/local/join')).toEqual({ name: 'local-join' });
    expect(routeFor('#/local/join?code=K7Q2MX')).toEqual({ name: 'local-join', code: 'K7Q2MX' });
    expect(routeFor(localJoinHash('K7Q2MX'))).toEqual({ name: 'local-join', code: 'K7Q2MX' });
  });
});
