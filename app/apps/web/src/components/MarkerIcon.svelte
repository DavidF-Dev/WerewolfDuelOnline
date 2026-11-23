<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import { resolveArt, type MarkerId } from '../themes/resolve.js';

  interface Props {
    localiser: Localiser;
    marker: MarkerId;
    /** How many are held; without it the marker's name is shown. */
    count?: number;
    /** Shows only the count beside the icon, keeping the full label for hover and screen readers. */
    compact?: boolean;
  }

  let { localiser: l, marker, count, compact = false }: Props = $props();
  const label = $derived(
    count === undefined ? l.t(`marker-${marker}`) : l.t(`count-${marker}`, { n: count }),
  );
  const url = $derived(resolveArt('placeholder', 'markers', marker));
</script>

<span class="marker {marker}" data-part="marker" title={compact ? label : undefined}>
  <span class="icon" data-part="icon" aria-hidden="true" style:mask-image={`url("${url}")`}></span>
  {#if compact && count !== undefined}
    <span aria-hidden="true">{count}</span>
    <span class="visually-hidden">{label}</span>
  {:else}
    <span>{label}</span>
  {/if}
</span>

<style>
  .marker {
    align-items: center;
    display: inline-flex;
    font-weight: 700;
    gap: 0.25rem;
  }

  .icon {
    background: currentColor;
    flex: none;
    height: 1.25em;
    mask-position: center;
    mask-repeat: no-repeat;
    mask-size: contain;
    width: 1.25em;
  }

  .health .icon {
    background: var(--heart);
  }

  .potion .icon {
    background: var(--ok);
  }

  .badge .icon {
    background: var(--warn);
  }
</style>
