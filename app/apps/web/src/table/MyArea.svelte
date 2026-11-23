<script lang="ts">
  import type { Seat, View } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import CharacterCard from '../components/CharacterCard.svelte';
  import DeductionTracker from './DeductionTracker.svelte';
  import MarkerList from './MarkerList.svelte';

  interface Props {
    localiser: Localiser;
    name: string;
    view: View;
    seat: Seat;
  }

  let { localiser: l, name, view, seat }: Props = $props();
  const uid = $props.id();
  const player = $derived(view.players[seat === 'p0' ? 0 : 1]);
  const hand = $derived(player.hand ?? []);
</script>

<section class="mine" aria-labelledby="{uid}-heading" data-testid="my-area">
  <h2 id="{uid}-heading">{l.t('my-area-heading', { name })}</h2>
  <MarkerList localiser={l} {player} hasBadge={view.badge === seat} testId="my" />
  <h3 id="{uid}-hand">{l.t('my-hand-heading')}</h3>
  {#if hand.length === 0}
    <p>{l.t('my-hand-empty')}</p>
  {:else}
    <ul class="cards" aria-labelledby="{uid}-hand" data-testid="my-hand">
      {#each hand as c (c)}
        <li data-testid="card-{c}"><CharacterCard localiser={l} character={c} /></li>
      {/each}
    </ul>
  {/if}
  <DeductionTracker localiser={l} {view} {seat} />
</section>

<style>
  .mine {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem;
  }

  h2 {
    font-size: 1.125rem;
    margin: 0;
  }

  h3 {
    font-size: 1rem;
    margin: 0;
  }

  p {
    margin: 0;
  }

  .cards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .cards li {
    margin: 0;
  }
</style>
