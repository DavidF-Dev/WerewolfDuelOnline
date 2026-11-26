import { describe, expect, it, vi } from 'vitest';
import { JAPANESE_FACES, createFontLoader } from '../../src/theme/fonts.js';

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

describe('Japanese fonts', () => {
  it('the loader has a Japanese entry beside the reading fonts', async () => {
    const japanese = vi.fn(() => Promise.resolve());
    const load = createFontLoader({ lexend: vi.fn(), opendyslexic: vi.fn(), japanese });
    await load('japanese');
    await load('japanese');
    expect(japanese).toHaveBeenCalledOnce();
  });

  it('names the three Japanese faces, each in its own weight', () => {
    expect(JAPANESE_FACES).toEqual([
      '400 1em "BIZ UDPGothic"',
      '700 1em "BIZ UDPGothic"',
      '700 1em "Shippori Mincho B1"',
    ]);
  });
});

describe('loading the Japanese faces', () => {
  it('a failed load is tried again, replacing only the faces that failed', async () => {
    let failing = true;
    class FakeFace {
      status = 'unloaded';
      constructor(
        readonly family: string,
        readonly source: string,
      ) {}
      load(): Promise<this> {
        if (this.status === 'error' || (failing && this.family === 'Shippori Mincho B1')) {
          this.status = 'error';
          return Promise.reject(new Error('offline'));
        }
        this.status = 'loaded';
        return Promise.resolve(this);
      }
    }
    const faces = new Set<FakeFace>();
    vi.stubGlobal('FontFace', FakeFace);
    const fonts = document.fonts;
    Object.defineProperty(document, 'fonts', { value: faces, configurable: true });
    try {
      vi.resetModules();
      const { loadFont } = await import('../../src/theme/fonts.js');
      await loadFont('japanese');
      expect(faces.size).toBe(3);
      failing = false;
      await loadFont('japanese');
      expect(faces.size).toBe(3);
      expect([...faces].map((face) => face.status)).toEqual(['loaded', 'loaded', 'loaded']);
    } finally {
      Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
      vi.unstubAllGlobals();
    }
  });
});
