<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import MarkerCount, { MARKER_CHANGE_MS } from '../components/MarkerCount.svelte';
  import MarkerIcon from '../components/MarkerIcon.svelte';
  import Chip from '../kit/Chip.svelte';
  import type { Markers } from './shown-markers.js';

  interface Props {
    localiser: Localiser;
    markers: Markers;
    hasBadge: boolean;
    /** Whether a count that changes is shown as a gain or a loss. */
    animate?: boolean;
    /** Prefix for this list's test id. */
    testId: string;
    /** Spreads the markers across the row's width. */
    spread?: boolean;
    /** Fills the row's width and puts the Badge at its end. */
    badgeAtEnd?: boolean;
  }

  let {
    localiser: l,
    markers,
    hasBadge,
    animate = false,
    testId,
    spread = false,
    badgeAtEnd = false,
  }: Props = $props();

  const COUNTED = ['health', 'cross', 'fang', 'hourglass'] as const;

  // A Potion that arrives after the list is first drawn counts as gained.
  let drawn = $state(false);
  onMount(() => {
    drawn = true;
  });

  // A Potion that leaves stays as long as its loss is shown, hidden from screen readers.
  let leaving = $state(false);
  let held = untrack(() => markers.potion);
  $effect.pre(() => {
    const now = markers.potion;
    if (now === held) return;
    held = now;
    leaving = !now && untrack(() => animate);
  });
  $effect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => (leaving = false), MARKER_CHANGE_MS);
    return () => clearTimeout(timer);
  });
</script>

<ul class={['markers', { spread, 'badge-at-end': badgeAtEnd }]} data-testid="{testId}-markers">
  {#each COUNTED as marker (marker)}
    <li data-marker={marker}>
      <MarkerCount localiser={l} {marker} value={markers[marker]} {animate} />
    </li>
  {/each}
  {#if markers.potion || leaving}
    <li data-marker="potion" aria-hidden={markers.potion ? undefined : 'true'}>
      <MarkerCount
        localiser={l}
        marker="potion"
        value={markers.potion ? 1 : 0}
        from={drawn ? 0 : 1}
        name={l.t('marker-potion')}
        {animate}
      />
    </li>
  {/if}
  {#if hasBadge}
    <li class="badge">
      <Chip data-testid="{testId}-badge" fit>
        {#snippet icon()}<MarkerIcon marker="badge" />{/snippet}{l.t('marker-badge')}
      </Chip>
    </li>
  {/if}
</ul>

<style>
  .markers {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    font-size: 0.75rem;
    gap: 2px 10px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .spread {
    flex: 1 1 auto;
    justify-content: space-between;
  }

  .markers li {
    align-items: center;
    display: flex;
    margin: 0;
  }

  .badge-at-end {
    flex: 1 1 auto;
  }

  .badge {
    min-width: 0;
  }

  .badge-at-end .badge {
    margin-inline-start: auto;
  }
</style>
