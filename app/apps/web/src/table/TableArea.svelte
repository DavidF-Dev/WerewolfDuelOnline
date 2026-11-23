<script lang="ts">
  import type { Event, Seat, View } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { characterName, planStatus } from '../text.js';
  import InitiativeTrack from './InitiativeTrack.svelte';

  interface Props {
    localiser: Localiser;
    view: View;
    seat: Seat;
    events: Array<[number, Event]>;
    /** How each seat is named on the table. */
    names: Record<Seat, string>;
  }

  let { localiser: l, view, seat, events, names }: Props = $props();
  const uid = $props.id();

  const index = (s: Seat): 0 | 1 => (s === 'p0' ? 0 : 1);
  const opponentSeat = $derived<Seat>(seat === 'p0' ? 'p1' : 'p0');
</script>

<section class="area" aria-labelledby="{uid}-heading" data-testid="table-area">
  <div class="title">
    <h2 id="{uid}-heading">{l.t('table-area-heading')}</h2>
    <p data-testid="round">{l.t('table-round', { round: view.round })}</p>
  </div>
  <ul class="plans">
    {#each [opponentSeat, seat] as s (s)}
      <li data-testid="table-plan-{s}">
        {l.t('table-plan', { name: names[s], status: planStatus(l, view.players[index(s)].plan) })}
      </li>
    {/each}
  </ul>
  {#if view.potion_target !== null}
    <p data-testid="potion-target">
      {l.t('potion-target', { card: characterName(l, view.potion_target.card) })}
    </p>
  {/if}
  <InitiativeTrack localiser={l} {view} {events} {names} />
</section>

<style>
  .area {
    border: 1px dashed var(--control-line);
    border-radius: var(--radius);
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem;
  }

  .title {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
  }

  h2 {
    font-size: 1.125rem;
    margin: 0;
  }

  p {
    margin: 0;
  }

  .plans {
    margin: 0;
    padding-left: 1.25rem;
  }
</style>
