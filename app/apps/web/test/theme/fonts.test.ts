import { describe, expect, it, vi } from 'vitest';
import { createFontLoader } from '../../src/theme/fonts.js';

describe('reading fonts', () => {
  it('loads a reading font only when it is chosen, and only once', async () => {
    const lexend = vi.fn(() => Promise.resolve());
    const opendyslexic = vi.fn(() => Promise.resolve());
    const load = createFontLoader({ lexend, opendyslexic });
    await load('default');
    expect(lexend).not.toHaveBeenCalled();
    expect(opendyslexic).not.toHaveBeenCalled();
    await load('lexend');
    await load('lexend');
    expect(lexend).toHaveBeenCalledOnce();
    expect(opendyslexic).not.toHaveBeenCalled();
  });

  it('tries again after a failed load without rejecting', async () => {
    const lexend = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const load = createFontLoader({ lexend, opendyslexic: () => Promise.resolve() });
    await expect(load('lexend')).resolves.toBeUndefined();
    await load('lexend');
    expect(lexend).toHaveBeenCalledTimes(2);
  });
});
