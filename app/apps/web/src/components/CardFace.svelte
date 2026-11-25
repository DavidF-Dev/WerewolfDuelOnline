<script lang="ts" module>
  export type CardFaction = 'human' | 'werewolf' | 'neutral';
  /** Large for inspecting and revealing, medium for the hand, and the small target card. */
  export type CardSize = 'large' | 'medium' | 'target';
</script>

<script lang="ts">
  import type { RichPart } from '@wwd/client-core';
  import type { AbilityPill } from '../cards.js';
  import RichText from '../kit/RichText.svelte';
  import { display } from '../settings/display.svelte.js';
  import { artSymbol, type CardArtId } from '../themes/resolve.js';
  import AbilityPillIcon from './AbilityPillIcon.svelte';
  import { fitText } from './fit-text.js';

  interface Props {
    /** The name printed on the card. */
    name: string;
    faction: CardFaction;
    /** The initiative shown in the corner, or null for a card without one. */
    initiative: number | null;
    art: CardArtId;
    size?: CardSize;
    pills: readonly AbilityPill[];
    /** The ability text drawn below the pills on large and medium cards. */
    text: readonly RichPart[];
    /** The words of a pill drawn in place of the ability pills, such as "In hand". */
    inHand?: string;
    /** The id of the "In hand" pill, so the card can be described by it. */
    inHandId?: string;
  }

  let {
    name,
    faction,
    initiative,
    art,
    size = 'large',
    pills,
    text,
    inHand,
    inHandId,
  }: Props = $props();

  const THEME = 'placeholder';
  const textOnly = $derived(display.cardText === 'text-only');
  const pattern = $derived(faction === 'werewolf' ? 'hatched' : 'tinted');
</script>

{#snippet initiativeNumber()}
  <span class="initiative" data-part="initiative">{initiative ?? '–'}</span>
{/snippet}

{#snippet factionIcon()}
  {#if faction !== 'neutral'}
    <svg class="faction-icon" data-part="faction" data-faction={faction} focusable="false"
      ><use href={artSymbol(THEME, 'factions', faction)} /></svg
    >
  {/if}
{/snippet}

<span
  class="face {size} {faction}"
  class:strong={display.colourBlindPatterns}
  aria-hidden="true"
  data-part="face"
>
  {#if size === 'target'}
    <span class="top" data-part="top"
      ><span class="name" data-part="name" use:fitText>{name}</span></span
    >
    <span class="art" data-part="art" data-pattern={pattern}>
      {@render initiativeNumber()}
      {#if !textOnly}
        <svg class="glyph" data-part="glyph" focusable="false"
          ><use href={artSymbol(THEME, 'cards', art)} /></svg
        >
      {/if}
      {@render factionIcon()}
    </span>
  {:else}
    <span class="top" data-part="top">
      {@render initiativeNumber()}
      <span class="name" data-part="name" use:fitText>{name}</span>
      {@render factionIcon()}
    </span>
    <span class="art" data-part="art" data-pattern={pattern}>
      {#if !textOnly}
        <svg class="glyph" data-part="glyph" focusable="false"
          ><use href={artSymbol(THEME, 'cards', art)} /></svg
        >
      {/if}
    </span>
  {/if}
  {#if inHand !== undefined}
    <span class="pills" data-part="pills">
      <span class="pill in-hand" id={inHandId} data-part="in-hand">{inHand}</span>
    </span>
  {:else if !textOnly && pills.length > 0}
    <span class="pills" data-part="pills">
      {#each pills as pill, i (i)}
        <AbilityPillIcon {pill} />
      {/each}
    </span>
  {/if}
  {#if size !== 'target'}
    <span class="text" data-part="text"><RichText parts={text} /></span>
  {/if}
</span>

<style>
  .face {
    --edge: var(--neutral);
    --edge-width: 2.5px;
    --art-fill: color-mix(in srgb, var(--edge) 12%, var(--surface));
    background: var(--surface);
    border: var(--edge-width) solid var(--edge);
    border-radius: 9px;
    box-shadow: 0 1px 3px rgb(0 0 0 / 18%);
    box-sizing: border-box;
    color: var(--ink);
    display: flex;
    flex-direction: column;
    inset: 0;
    overflow: hidden;
    position: absolute;
    text-align: center;
  }

  .face > * {
    opacity: var(--card-content-opacity, 1);
  }

  .face.human {
    --edge: var(--human);
    --art-fill: color-mix(in srgb, var(--edge) 10%, var(--surface));
  }

  .face.werewolf {
    --edge: var(--werewolf);
    --hatch-a: color-mix(in srgb, var(--edge) 8%, var(--surface));
    --hatch-b: color-mix(in srgb, var(--edge) 16%, var(--surface));
  }

  .face.werewolf.strong {
    --hatch-b: color-mix(in srgb, var(--edge) 32%, var(--surface));
  }

  /* Sizes: large 120 × 176, medium 98 × 146 and target 58 × 84 px at 100 % text. */
  .large {
    --top-pad: 0.25rem 0.3125rem 0.1875rem;
    --top-gap: 0.1875rem;
    --name-size: 0.78125rem;
    --faction-size: 1rem;
    --art-height: 3.875rem;
    --glyph-size: 2.5rem;
    --pills-pad: 0.3125rem 0.125rem 0.1875rem;
    --pills-gap: 0.25rem;
    --pill-height: 1.375rem;
    --pill-pad: 0 0.34375rem;
    --pill-gap: 0.125rem;
    --pill-font: 0.6875rem;
    --pill-line: 1rem;
    --shape-size: 0.8125rem;
    --spend-size: 0.5rem;
    --token-size: 1rem;
    --gain-size: 1.25rem;
    --text-size: 0.65625rem;
    --text-line: 1.2;
    --text-pad: 0 0.3125rem 0.3125rem;
  }

  .medium {
    --top-pad: 0.25rem 0.25rem 0.1875rem;
    --top-gap: 0.125rem;
    --name-size: 0.625rem;
    --initiative-size: 0.6875rem;
    --faction-size: 0.875rem;
    --art-height: 3.125rem;
    --glyph-size: 2rem;
    --pills-pad: 0.25rem 0.125rem 0.125rem;
    --pills-gap: 0.25rem;
    --pill-height: 1.375rem;
    --pill-pad: 0 0.28125rem;
    --pill-gap: 0.125rem;
    --pill-font: 0.6875rem;
    --pill-line: 1rem;
    --shape-size: 0.8125rem;
    --spend-size: 0.5rem;
    --token-size: 1rem;
    --gain-size: 1.25rem;
    --text-size: 0.5625rem;
    --text-line: 1.1;
    --text-pad: 0 0.1875rem 0.125rem;
  }

  .target {
    --pill-border: 1px;
    --top-pad: 0.1875rem 0.125rem 0.125rem;
    --name-size: 0.53125rem;
    --initiative-size: 0.53125rem;
    --faction-size: 0.5625rem;
    --art-height: 1.875rem;
    --glyph-size: 1.25rem;
    --pills-pad: 0.1875rem 0.0625rem 0;
    --pills-gap: 0.125rem;
    --pill-height: 0.875rem;
    --pill-pad: 0 0.15625rem;
    --pill-gap: 0.03125rem;
    --pill-font: 0.5rem;
    --pill-line: 0.625rem;
    --shape-size: 0.46875rem;
    --spend-size: 0.3125rem;
    --token-size: 0.625rem;
    --gain-size: 0.8125rem;
  }

  .top {
    align-items: center;
    display: flex;
    flex: none;
    gap: var(--top-gap, 0);
    padding: var(--top-pad);
  }

  .target .top {
    justify-content: center;
  }

  .initiative {
    font: 700 var(--initiative-size, var(--name-size)) / 1 var(--font-label);
    min-width: 0.6875rem;
    text-align: start;
  }

  /* The line height stays at the normal size's, so a name shrunk to fit leaves the rows in place. */
  .name {
    flex: 1;
    font-size: var(--name-size);
    font-weight: 700;
    line-height: calc(var(--name-size) * 1.05);
    min-width: 0;
  }

  .faction-icon {
    color: var(--edge);
    fill: currentColor;
    flex: none;
    height: var(--faction-size);
    width: var(--faction-size);
  }

  .art {
    background: var(--art-fill);
    border-radius: 5px;
    display: grid;
    flex: none;
    height: var(--art-height);
    margin: 0 0.3125rem;
    place-items: center;
    position: relative;
  }

  .art[data-pattern='hatched'] {
    background: repeating-linear-gradient(135deg, var(--hatch-a) 0 6px, var(--hatch-b) 6px 8px);
  }

  .target .art {
    margin: 0.0625rem 0.25rem 0;
  }

  .target .initiative {
    left: 0.1875rem;
    min-width: 0;
    position: absolute;
    top: 0.125rem;
  }

  .target .faction-icon {
    position: absolute;
    right: 0.1875rem;
    top: 0.1875rem;
  }

  .glyph {
    color: var(--edge);
    fill: currentColor;
    height: var(--glyph-size);
    width: var(--glyph-size);
  }

  .pills {
    align-items: center;
    display: flex;
    flex: none;
    flex-wrap: nowrap;
    gap: var(--pills-gap);
    justify-content: center;
    padding: var(--pills-pad);
  }

  .pill {
    align-items: center;
    border-radius: 999px;
    box-sizing: border-box;
    display: inline-flex;
    flex: none;
    font-size: var(--pill-font);
    font-weight: 700;
    gap: var(--pill-gap);
    line-height: var(--pill-line);
    padding: var(--pill-pad);
    white-space: nowrap;
  }

  .in-hand {
    background: var(--chip);
    border: 1px solid var(--line);
    color: var(--muted);
    font-size: 0.625rem;
  }

  .target .in-hand {
    font-size: 0.5rem;
    line-height: 0.8125rem;
    padding: 0 0.3125rem;
  }

  .text {
    flex: 1;
    font-size: var(--text-size);
    line-height: var(--text-line);
    min-height: 0;
    overflow: hidden;
    padding: var(--text-pad);
  }

  .text :global([data-part='icon']) {
    --token-size: 1.25em;
  }

  @media (forced-colors: active) {
    .face {
      --edge: CanvasText;
      border-color: CanvasText;
    }

    .glyph,
    .faction-icon,
    .in-hand {
      color: CanvasText;
    }

    .in-hand {
      border-color: CanvasText;
    }
  }
</style>
