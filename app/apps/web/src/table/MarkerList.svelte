<script lang="ts">
  import type { PlayerView } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import MarkerIcon from '../components/MarkerIcon.svelte';
  import Chip from '../kit/Chip.svelte';

  interface Props {
    localiser: Localiser;
    player: PlayerView;
    hasBadge: boolean;
    /** Prefix for this list's test id. */
    testId: string;
    /** Spreads the markers across the row's width. */
    spread?: boolean;
    /** Fills the row's width and puts the Badge at its end. */
    badgeAtEnd?: boolean;
  }

  let {
    localiser: l,
    player,
    hasBadge,
    testId,
    spread = false,
    badgeAtEnd = false,
  }: Props = $props();
</script>

<ul class={['markers', { spread, 'badge-at-end': badgeAtEnd }]} data-testid="{testId}-markers">
  <li><MarkerIcon localiser={l} marker="health" count={player.health} compact /></li>
  <li><MarkerIcon localiser={l} marker="cross" count={player.cross} compact /></li>
  <li><MarkerIcon localiser={l} marker="fang" count={player.fang} compact /></li>
  <li><MarkerIcon localiser={l} marker="hourglass" count={player.hourglass} compact /></li>
  {#if player.placed > 0}
    <li class="placed">{l.t('count-placed', { n: player.placed })}</li>
  {/if}
  {#if player.potion}
    <li><MarkerIcon localiser={l} marker="potion" /></li>
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

  .placed {
    color: var(--muted);
  }
</style>
