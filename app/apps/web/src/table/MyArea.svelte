<script lang="ts">
  import type { Seat, View } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import MarkerList from './MarkerList.svelte';
  import type { Markers } from './shown-markers.js';

  interface Props {
    localiser: Localiser;
    name: string;
    view: View;
    seat: Seat;
    /** The markers to show, when they differ from the view's, as partway through a showdown. */
    markers?: Markers;
    /** Whether a marker count that changes is shown as a gain or a loss. */
    animate?: boolean;
    /** Whether to show the Badge, when it differs from the view's, as partway through a showdown. */
    hasBadge?: boolean;
  }

  let { localiser: l, name, view, seat, markers, animate = false, hasBadge }: Props = $props();
  const player = $derived(view.players[seat === 'p0' ? 0 : 1]);
</script>

<section
  class="mine"
  aria-label={l.t('my-area-heading', { name })}
  data-testid="my-area"
  data-part="my-strip"
>
  <MarkerList
    localiser={l}
    markers={markers ?? player}
    hasBadge={hasBadge ?? view.badge === seat}
    {animate}
    testId="my"
    spread
  />
  <span class="you">{l.t('table-you')}</span>
</section>

<style>
  .mine {
    align-items: center;
    display: flex;
    flex: none;
    gap: 8px;
    justify-content: space-between;
    padding: 0 2px;
  }

  .you {
    color: var(--muted);
    flex: none;
    font-size: 0.71875rem;
    white-space: nowrap;
  }
</style>
