import type { Character } from '@wwd/engine';

export type CardArtId = Character | 'fool';

export type MarkerId = 'health' | 'cross' | 'fang' | 'hourglass' | 'badge' | 'potion';

/** Every marker, in display order. */
export const MARKERS: readonly MarkerId[] = [
  'health',
  'cross',
  'fang',
  'hourglass',
  'badge',
  'potion',
];

interface ArtIds {
  cards: CardArtId;
  markers: MarkerId;
}

export type ArtKind = keyof ArtIds;

/** A theme pack's art, as URLs keyed by engine id; a pack may leave any entry out. */
export type ThemeArt = { [K in ArtKind]: Partial<Record<ArtIds[K], string>> };

interface ThemeManifest {
  cards: Record<string, string>;
  markers: Record<string, string>;
}

export const FALLBACK_THEME = 'placeholder';

const manifests = import.meta.glob<ThemeManifest>('./*/theme.json', {
  eager: true,
  import: 'default',
});
const files = import.meta.glob<string>('./*/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

function artFor(dir: string, entries: Record<string, string>): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const [id, file] of Object.entries(entries)) {
    const url = files[`${dir}/${file}`];
    if (url !== undefined) urls[id] = url;
  }
  return urls;
}

/** Every bundled theme pack, keyed by its folder name. */
export const THEME_PACKS: Readonly<Record<string, ThemeArt>> = Object.fromEntries(
  Object.entries(manifests).map(([path, manifest]) => {
    const dir = path.slice(0, path.lastIndexOf('/'));
    return [
      dir.slice(2),
      { cards: artFor(dir, manifest.cards), markers: artFor(dir, manifest.markers) },
    ];
  }),
);

/** Returns a resolver that looks art up in a pack, falling back to the placeholder pack's entry. */
export function createArtResolver(packs: Readonly<Record<string, ThemeArt>>) {
  return <K extends ArtKind>(themeId: string, kind: K, id: ArtIds[K]): string => {
    const own = (packs[themeId]?.[kind] as Partial<Record<ArtIds[K], string>> | undefined)?.[id];
    const fallback = (packs[FALLBACK_THEME]?.[kind] as Partial<Record<ArtIds[K], string>>)?.[id];
    const url = own ?? fallback;
    if (url === undefined)
      throw new Error(`the ${FALLBACK_THEME} theme has no ${kind} art for ${id}`);
    return url;
  };
}

/** The URL of the art for `id` in the bundled theme `themeId`, or the placeholder's. */
export const resolveArt = createArtResolver(THEME_PACKS);
