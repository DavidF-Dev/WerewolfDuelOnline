<script lang="ts" module>
  /** How long a change is shown, in milliseconds. */
  export const MARKER_CHANGE_MS = 1_200;

  let frozen = false;

  /**
   * Draws every marker change from now on as it looks partway through, without moving or fading,
   * so that a gallery picture of one is steady; returns a function that stops it.
   */
  export function freezeMarkerChanges(): () => void {
    frozen = true;
    return () => {
      frozen = false;
    };
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import { motionReduced } from '../settings/apply.js';
  import { display } from '../settings/display.svelte.js';
  import type { MarkerId } from '../themes/resolve.js';
  import MarkerIcon from './MarkerIcon.svelte';

  interface Props {
    localiser: Localiser;
    marker: MarkerId;
    value: number;
    /** Whether a change of `value` after the first drawing is shown as a gain or a loss. */
    animate: boolean;
    /** The value to count the first drawing's change from; the first drawing is still without it. */
    from?: number;
    /** The label in place of the count's own. */
    name?: string;
  }

  let { localiser: l, marker, value, animate, from, name }: Props = $props();

  let previous = untrack(() => from ?? value);
  let serial = $state(0);
  let change = $state<{ delta: number; still: boolean; frozen: boolean } | null>(null);

  $effect.pre(() => {
    const now = value;
    if (now === previous) return;
    const delta = now - previous;
    previous = now;
    if (!untrack(() => animate)) return;
    change = { delta, still: motionReduced(untrack(() => display.reducedMotion)), frozen };
    serial += 1;
  });

  $effect(() => {
    if (change === null || change.frozen) return;
    const timer = setTimeout(() => {
      change = null;
      serial += 1;
    }, MARKER_CHANGE_MS);
    return () => clearTimeout(timer);
  });

  const kind = $derived(change === null ? undefined : change.delta > 0 ? 'gain' : 'loss');
  const delta = $derived(
    change === null ? '' : change.delta > 0 ? `+${change.delta}` : `−${-change.delta}`,
  );
</script>

{#key serial}
  <span
    class={['cell', kind, { still: change?.still, frozen: change?.frozen }]}
    data-part="count-cell"
    data-change={kind}
    ><MarkerIcon localiser={l} {marker} count={value} compact {name} />{#if change !== null}<span
        class="delta"
        data-part="delta"
        aria-hidden="true">{delta}</span
      >{/if}</span
  >
{/key}

<style>
  .cell {
    --change: var(--ok);
    align-items: center;
    border-radius: 999px;
    display: inline-flex;
    isolation: isolate;
    position: relative;
  }

  .loss {
    --change: var(--heart);
  }

  .cell :global([data-part='count']) {
    display: inline-block;
  }

  /* The glow sits behind the marker and its count, outside the row's flow. */
  .gain::before,
  .loss::before {
    background: color-mix(in srgb, var(--change) 26%, transparent);
    border-radius: inherit;
    box-shadow: 0 0 6px 2px color-mix(in srgb, var(--change) 45%, transparent);
    content: '';
    inset: -2px -4px;
    position: absolute;
    z-index: -1;
  }

  .delta {
    color: var(--change);
    font-size: 0.625rem;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    inset-block-end: 55%;
    inset-inline-start: 100%;
    line-height: 1;
    margin-inline-start: -0.15em;
    pointer-events: none;
    position: absolute;
    white-space: nowrap;
  }

  .gain::before,
  .loss::before {
    animation: marker-glow 1.2s ease-out forwards;
  }

  .delta {
    animation: marker-delta 1.2s ease-out forwards;
  }

  .gain :global([data-part='count']) {
    animation: marker-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .loss :global([data-part='count']) {
    animation: marker-fall 0.45s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Reduced motion and the gallery's frozen picture draw the change still until it is cleared. */
  .still::before,
  .still .delta,
  .frozen::before,
  .frozen .delta,
  .still :global([data-part='count']),
  .frozen :global([data-part='count']) {
    animation: none;
  }

  .still::before {
    background: none;
    box-shadow: 0 0 0 2px var(--change);
  }

  .frozen::before {
    opacity: 0.7;
  }

  @keyframes marker-glow {
    from {
      opacity: 1;
    }

    to {
      opacity: 0;
    }
  }

  @keyframes marker-delta {
    0%,
    60% {
      opacity: 1;
    }

    to {
      opacity: 0;
    }
  }

  @keyframes marker-rise {
    from {
      translate: 0 0.55em;
    }

    60% {
      scale: 1.2;
    }

    to {
      translate: 0 0;
      scale: 1;
    }
  }

  @keyframes marker-fall {
    from {
      translate: 0 -0.55em;
    }

    to {
      translate: 0 0;
    }
  }

  @media (forced-colors: active) {
    .gain::before,
    .loss::before {
      background: none;
      box-shadow: none;
      outline: 2px solid CanvasText;
    }

    .delta {
      color: CanvasText;
    }
  }
</style>
