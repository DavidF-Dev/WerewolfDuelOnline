<script lang="ts" module>
  import type { MarkerId } from '../themes/resolve.js';

  /** Markers drawn on a round token; Health and the Badge are drawn bare. */
  const TOKENS: ReadonlySet<MarkerId> = new Set(['cross', 'fang', 'hourglass', 'potion']);
</script>

<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import { artSymbol } from '../themes/resolve.js';

  type Props =
    | {
        localiser: Localiser;
        marker: MarkerId;
        /** How many are held; without it the marker's name is shown. */
        count?: number;
        /** Shows only the count beside the icon, keeping the full label for hover and screen readers. */
        compact?: boolean;
        /** The label in place of the count's own. */
        name?: string;
        label?: undefined;
        ring?: undefined;
      }
    | {
        marker: MarkerId;
        /** The word shown after the icon, as it reads in its sentence. */
        label: string;
        localiser?: undefined;
        count?: undefined;
        compact?: undefined;
        name?: undefined;
        ring?: undefined;
      }
    | {
        /** Draws the icon alone, as decoration, such as in a card's ability row. */
        marker: MarkerId;
        /** Rings the token to show that the marker is gained. */
        ring?: 'gain';
        localiser?: undefined;
        label?: undefined;
        count?: undefined;
        compact?: undefined;
        name?: undefined;
      };

  let { localiser: l, marker, count, compact = false, name, label: word, ring }: Props = $props();
  const label = $derived(
    word ??
      name ??
      (l === undefined
        ? undefined
        : count === undefined
          ? l.t(`marker-${marker}`)
          : l.t(`count-${marker}`, { n: count })),
  );
  const token = $derived(TOKENS.has(marker));
</script>

{#snippet icon()}<span
    class="icon"
    class:token
    class:gain={ring === 'gain'}
    data-part="icon"
    data-token={token ? '' : undefined}
    data-ring={ring}
    aria-hidden="true"
    ><svg focusable="false"><use href={artSymbol('placeholder', 'markers', marker)} /></svg></span
  >{/snippet}

{#if label === undefined}
  <span class="marker {marker}" data-part="marker" aria-hidden="true">{@render icon()}</span>
{:else}
  <span
    class={['marker', 'labelled', marker, { compact }]}
    data-part="marker"
    title={compact ? label : undefined}
    >{@render icon()}{#if compact && count !== undefined}<span data-part="count" aria-hidden="true"
        >{count}</span
      ><span class="visually-hidden">{label}</span>{:else}<span>{label}</span>{/if}</span
  >
{/if}

<style>
  .marker {
    align-items: center;
    display: inline-flex;
    font-weight: 700;
  }

  .labelled {
    display: inline;
    white-space: nowrap;
  }

  .icon {
    display: inline-block;
    flex: none;
    height: var(--marker-size, 1.25em);
    position: relative;
    vertical-align: -0.25em;
    width: var(--marker-size, 1.25em);
  }

  /* A zero-height margin box at the icon's centre, raised half the cap height, never grows the line. */
  @supports (vertical-align: 1cap) {
    .labelled .icon {
      margin-block: calc(-0.5 * var(--marker-size, 1.25em));
      vertical-align: 0.5cap;
    }
  }

  .labelled .icon {
    margin-inline-end: 0.2em;
  }

  /* A count in a row of markers centres its icon on the item, as a token or chip beside it is. */
  .labelled.compact {
    display: inline-flex;
  }

  .labelled.compact .icon {
    margin-block: 0;
    vertical-align: baseline;
  }

  .icon svg {
    fill: currentColor;
    height: 100%;
    inset: 0;
    margin: auto;
    position: absolute;
    width: 100%;
  }

  .token {
    --marker-size: var(--token-size, 1.3em);
    background: var(--surface);
    border: max(1px, 0.09em) solid color-mix(in srgb, var(--ink) 45%, transparent);
    border-radius: 50%;
    box-shadow: 0 1px 0 color-mix(in srgb, var(--ink) 18%, transparent);
    box-sizing: border-box;
    color: var(--ink);
  }

  .token svg {
    height: 68%;
    width: 68%;
  }

  .token.gain {
    --marker-size: var(--gain-size, var(--token-size, 1.3em));
    border: max(1.5px, 0.12em) solid var(--ok);
  }

  .token.gain svg {
    height: 60%;
    width: 60%;
  }

  .health .icon {
    color: var(--heart);
  }

  .badge .icon {
    color: var(--warn);
  }

  @media (forced-colors: active) {
    .marker .icon {
      color: CanvasText;
    }
  }
</style>
