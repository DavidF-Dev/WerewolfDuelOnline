import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import '@fontsource/marcellus/latin-400.css';
import type { Settings } from '../settings/settings.js';

export type ReadingFont = Settings['readingFont'];

export type FontLoaders = Record<Exclude<ReadingFont, 'default'>, () => Promise<unknown>>;

/**
 * Returns a function that loads a reading font's stylesheets the first time it is chosen.
 * A failed load resolves anyway, since the stylesheet falls back to the system font, and is
 * tried again the next time.
 */
export function createFontLoader(loaders: FontLoaders): (font: ReadingFont) => Promise<void> {
  const loads = new Map<keyof FontLoaders, Promise<void>>();
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

/** Loads the Latin subset of a reading font on demand. */
export const loadReadingFont = createFontLoader({
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
});
