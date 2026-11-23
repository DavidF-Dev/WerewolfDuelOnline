<script lang="ts">
  import type { PlayerView } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import MarkerIcon from '../components/MarkerIcon.svelte';

  interface Props {
    localiser: Localiser;
    player: PlayerView;
    hasBadge: boolean;
    /** Prefix for this list's test id. */
    testId: string;
  }

  let { localiser: l, player, hasBadge, testId }: Props = $props();
</script>

<ul class="markers" data-testid="{testId}-markers">
  <li><MarkerIcon localiser={l} marker="health" count={player.health} /></li>
  <li><MarkerIcon localiser={l} marker="cross" count={player.cross} /></li>
  <li><MarkerIcon localiser={l} marker="fang" count={player.fang} /></li>
  <li><MarkerIcon localiser={l} marker="hourglass" count={player.hourglass} /></li>
  {#if player.placed > 0}
    <li>{l.t('count-placed', { n: player.placed })}</li>
  {/if}
  {#if player.potion}
    <li><MarkerIcon localiser={l} marker="potion" /></li>
  {/if}
  {#if hasBadge}
    <li><MarkerIcon localiser={l} marker="badge" /></li>
  {/if}
</ul>

<style>
  .markers {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .markers li {
    margin: 0;
  }
</style>
