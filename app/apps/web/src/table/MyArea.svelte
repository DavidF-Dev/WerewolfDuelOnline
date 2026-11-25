<script lang="ts">
  import type { Seat, View } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import MarkerList from './MarkerList.svelte';

  interface Props {
    localiser: Localiser;
    name: string;
    view: View;
    seat: Seat;
  }

  let { localiser: l, name, view, seat }: Props = $props();
  const player = $derived(view.players[seat === 'p0' ? 0 : 1]);
</script>

<section
  class="mine"
  aria-label={l.t('my-area-heading', { name })}
  data-testid="my-area"
  data-part="my-strip"
>
  <MarkerList localiser={l} {player} hasBadge={view.badge === seat} testId="my" spread />
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
