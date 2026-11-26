/** A Japanese face the app ships as a subset. */
export interface JapaneseFont {
  readonly source: string;
  readonly family: string;
  readonly weight: number;
  readonly file: string;
  readonly fallback?: string;
}

/** A subset as its manifest describes it. */
export interface SubsetFace {
  readonly file: string;
  readonly family: string;
  readonly weight: number;
  readonly fallback?: string;
  readonly sha256: string;
  readonly characters: string;
}

export declare const FONTS_DIR: string;
export declare const MANIFEST: string;
export declare const LICENCE: string;
export declare const REGENERATE: string;
export declare const JAPANESE_FONTS: readonly JapaneseFont[];

/** What this Node's `ja-JP` formatters write for the app's forms, each character once. */
export declare function sweptIntlText(): string;

/** Every character the app's Japanese text uses, with `intl` (by default the recorded formatter text). */
export declare function japaneseText(options?: { intl?: string }): string;

/** Records this Node's formatter text in the manifest in `dir`, keeping the rest of it. */
export declare function recordIntlText(dir?: string): Promise<void>;

/** Checks the committed subsets in `dir` against `text`; rejects with what is wrong. */
export declare function checkJapaneseFonts(options?: {
  dir?: string;
  text?: string;
}): Promise<readonly SubsetFace[]>;
