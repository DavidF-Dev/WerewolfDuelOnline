import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import '@fontsource/marcellus/latin-400.css';
import type { Settings } from '../settings/settings.js';
import { FONT_CACHE } from './font-cache.js';
import gothicBold from './ja-fonts/biz-udpgothic-ja-700.woff2?url';
import gothicRegular from './ja-fonts/biz-udpgothic-ja-400.woff2?url';
import minchoBold from './ja-fonts/shippori-mincho-b1-ja-700.woff2?url';

export type ReadingFont = Settings['readingFont'];

/** A font loaded on demand: a reading font, or the faces of a language's script. */
export type OnDemandFont = Exclude<ReadingFont, 'default'> | 'japanese';

export type FontLoaders<Font extends string> = Record<Font, () => Promise<unknown>>;

/**
 * Returns a function that loads a font's stylesheets the first time it is asked for.
 * A failed load resolves anyway, since the stylesheet falls back to the system font, and is
 * tried again the next time.
 */
export function createFontLoader<Font extends string>(
  loaders: FontLoaders<Font>,
): (font: Font | 'default') => Promise<void> {
  const loads = new Map<Font, Promise<void>>();
  return (font) => {
    if (font === 'default') return Promise.resolve();
    let load = loads.get(font);
    if (load === undefined) {
      load = loaders[font]().then(
        () => undefined,
        () => {
          loads.delete(font);
        },
      );
      loads.set(font, load);
    }
    return load;
  };
}

/** The Japanese faces, each subset at build time to the app's Japanese text. */
const JAPANESE = [
  { family: 'BIZ UDPGothic', weight: '400', url: gothicRegular },
  { family: 'BIZ UDPGothic', weight: '700', url: gothicBold },
  { family: 'Shippori Mincho B1', weight: '700', url: minchoBold },
] as const;

/** A Japanese subset's file name, in any build. */
const JAPANESE_FILE = /\/(biz-udpgothic|shippori-mincho-b1)-ja-\d+[-.][^/]*$/;

/** The Japanese faces, as `document.fonts.load` takes them. */
export const JAPANESE_FACES = JAPANESE.map(({ family, weight }) => `${weight} 1em "${family}"`);

/** The Japanese faces added to the page; one that failed to load is replaced on the next try. */
let japaneseFaces: FontFace[] = [];

/**
 * Adds the Japanese faces and fetches them all at once, then keeps them in the service worker's
 * font cache, which a page the worker does not control yet would otherwise bypass.
 */
async function loadJapanese(): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
  // The DOM types leave out the set methods that FontFaceSet has.
  const set = document.fonts as unknown as Set<FontFace>;
  japaneseFaces = JAPANESE.map(({ family, weight, url }, i) => {
    const previous = japaneseFaces[i];
    if (previous !== undefined && previous.status !== 'error') return previous;
    if (previous !== undefined) set.delete(previous);
    const face = new FontFace(family, `url("${url}") format("woff2")`, { weight, display: 'swap' });
    set.add(face);
    return face;
  });
  await Promise.all(japaneseFaces.map((face) => face.load()));
  // The faces are in use whether or not the cache could keep them.
  await keepJapaneseFaces().catch(() => undefined);
}

/** Puts the Japanese faces in the font cache, and drops the ones of earlier builds. */
async function keepJapaneseFaces(): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || typeof caches === 'undefined')
    return;
  const cache = await caches.open(FONT_CACHE);
  const current = new Set(JAPANESE.map(({ url }) => new URL(url, location.href).href));
  for (const request of await cache.keys()) {
    if (JAPANESE_FILE.test(request.url) && !current.has(request.url)) await cache.delete(request);
  }
  for (const url of current) if ((await cache.match(url)) === undefined) await cache.add(url);
}

/** Loads a font on demand: the Latin subset of a reading font, or the Japanese faces. */
export const loadFont = createFontLoader<OnDemandFont>({
  lexend: () =>
    Promise.all([
      import('@fontsource/lexend/latin-400.css'),
      import('@fontsource/lexend/latin-700.css'),
    ]),
  opendyslexic: () =>
    Promise.all([
      import('@fontsource/opendyslexic/latin-400.css'),
      import('@fontsource/opendyslexic/latin-700.css'),
    ]),
  japanese: loadJapanese,
});

/** Loads a chosen reading font. */
export const loadReadingFont = (font: ReadingFont): Promise<void> => loadFont(font);
