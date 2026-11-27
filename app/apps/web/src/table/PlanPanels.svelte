<script lang="ts">
  import { effectiveInitiative, showdownOrder, type Plan, type Seat, type View } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { initiative } from '../cards.js';
  import PlayerSide from './PlayerSide.svelte';
  import { roundReveal, type SequencedEvent } from './showdown.js';

  interface Props {
    localiser: Localiser;
    view: View;
    events: SequencedEvent[];
    seat: Seat;
    /** Draws the cards smaller, for a screen short of room. */
    compact?: boolean;
  }

  let { localiser: l, view, events, seat, compact = false }: Props = $props();

  const index = (s: Seat): 0 | 1 => (s === 'p0' ? 0 : 1);
  const reveal = $derived(roundReveal(events));

  interface Shown {
    seat: Seat;
    plan: Plan;
    initiative: { printed: number; effective: number };
  }

  /** Both plans, in the order the showdown resolves them. */
  const sides = $derived.by((): Shown[] => {
    const order = reveal?.order ?? showdownOrder(view);
    if (order === null) return [];
    return order.flatMap((s) => {
      const shown = view.players[index(s)].plan;
      const plan =
        reveal?.plans[index(s)] ??
        (typeof shown === 'object' && 'revealed' in shown ? shown.revealed : null);
      if (plan === null) return [];
      const printed = initiative(plan.character);
      const effective =
        reveal?.effective[index(s)] ??
        effectiveInitiative(plan.character, view.players[index(s)].placed);
      return [{ seat: s, plan, initiative: { printed, effective } }];
    });
  });
</script>

{#if sides.length === 2}
  <ul
    class={['sides', { compact }]}
    aria-label={l.t('plan-panels-heading')}
    data-testid="plan-panels"
  >
    {#each sides as side, i (side.seat)}
      <li data-testid="plan-panel-{side.seat}">
        <PlayerSide
          localiser={l}
          who={side.seat === seat ? 'you' : 'opponent'}
          character={side.plan.character}
          initiative={side.initiative}
          targets={side.plan.targets}
          placed={null}
          position={i === 0 ? 1 : 2}
        />
      </li>
    {/each}
  </ul>
{/if}

<style>
  /* Side by side while both fit; otherwise one per row, their cards drawn smaller. */
  .sides {
    container-type: inline-size;
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .sides > li {
    flex: 1 1 0;
    margin: 0;
    min-width: 0;
  }

  .compact :global(.side > .slot) {
    zoom: 0.75;
  }

  @container (width < 19rem) {
    .sides > li {
      flex-basis: 100%;
    }

    .sides :global(.side > .slot) {
      zoom: 0.75;
    }
  }
</style>
