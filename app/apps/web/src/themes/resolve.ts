import type { MarkerId } from '@wwd/client-core';
import type { Character, Faction } from '@wwd/engine';

export type CardArtId = Character | 'fool';

export type { MarkerId };

/** A part of a card's ability row: the arrow from a spent marker to the attack it pays for. */
export type AbilityArtId = 'spend';

/**
 * Decoration drawn behind a screen: the treeline for a phone-width column, and for wider windows
 * a wide treeline with a plain band of trees that repeats beyond its ends.
 */
export type SceneryId = 'treeline' | 'treeline-wide' | 'treeline-band';

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
  factions: Faction;
  abilities: AbilityArtId;
  scenery: SceneryId;
}

export type ArtKind = keyof ArtIds;

/** A theme pack's art, as URLs keyed by engine id; a pack may leave any entry out. */
export type ThemeArt = { [K in ArtKind]: Partial<Record<ArtIds[K], string>> };

interface ThemeManifest {
  cards: Record<string, string>;
  markers: Record<string, string>;
  factions?: Record<string, string>;
  abilities?: Record<string, string>;
  scenery?: Record<string, string>;
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
      {
        cards: artFor(dir, manifest.cards),
        markers: artFor(dir, manifest.markers),
        factions: artFor(dir, manifest.factions ?? {}),
        abilities: artFor(dir, manifest.abilities ?? {}),
        scenery: artFor(dir, manifest.scenery ?? {}),
      },
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

/** The art kinds drawn from the inline sprite, so they take the text colour and forced colours. */
export type SpriteKind = Exclude<ArtKind, 'scenery'>;

const SPRITE_KINDS: readonly SpriteKind[] = ['cards', 'markers', 'factions', 'abilities'];
const SVG_NS = 'http://www.w3.org/2000/svg';

const sources = import.meta.glob<string>('./*/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});

/** The SVG source of `id` in the theme `themeId`, or the placeholder's. */
function sourceFor(themeId: string, kind: SpriteKind, id: string): string {
  for (const theme of [themeId, FALLBACK_THEME]) {
    const file = manifests[`./${theme}/theme.json`]?.[kind]?.[id];
    const source = file === undefined ? undefined : sources[`./${theme}/${file}`];
    if (source !== undefined) return source;
  }
  throw new Error(`the ${FALLBACK_THEME} theme has no ${kind} art for ${id}`);
}

/** Turns a standalone SVG into a `<symbol>` drawn in the colour of the element that uses it. */
function toSymbol(symbolId: string, svg: string): string {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 24 24';
  const inner = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replaceAll('#000', 'currentColor');
  return `<symbol id="${symbolId}" viewBox="${viewBox}">${inner}</symbol>`;
}

const spriteId = (themeId: string): string => `art-${themeId}`;

/** The id of the sprite symbol for `id` in the theme `themeId`. */
export const symbolId = <K extends SpriteKind>(themeId: string, kind: K, id: ArtIds[K]): string =>
  `${spriteId(themeId)}-${kind}-${id}`;

/** Every sprite symbol of the theme `themeId`, each falling back to the placeholder's art. */
export function spriteMarkup(themeId: string): string {
  const fallback = manifests[`./${FALLBACK_THEME}/theme.json`];
  return SPRITE_KINDS.flatMap((kind) =>
    Object.keys(fallback?.[kind] ?? {}).map((id) =>
      toSymbol(`${spriteId(themeId)}-${kind}-${id}`, sourceFor(themeId, kind, id)),
    ),
  ).join('');
}

/** A `<use>` reference to `id` in the theme `themeId`, adding the theme's sprite to the page once. */
export function artSymbol<K extends SpriteKind>(themeId: string, kind: K, id: ArtIds[K]): string {
  if (typeof document !== 'undefined' && document.getElementById(spriteId(themeId)) === null) {
    const sprite = document.createElementNS(SVG_NS, 'svg');
    sprite.id = spriteId(themeId);
    sprite.setAttribute('aria-hidden', 'true');
    sprite.setAttribute('style', 'position: absolute; width: 0; height: 0; overflow: hidden');
    sprite.innerHTML = spriteMarkup(themeId);
    document.body.prepend(sprite);
  }
  return `#${symbolId(themeId, kind, id)}`;
}
