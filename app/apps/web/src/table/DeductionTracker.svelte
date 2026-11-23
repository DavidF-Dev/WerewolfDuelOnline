<script lang="ts">
  import type { Seat, TargetCard as Card, View } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { TARGET_CARDS, targetId } from '../cards.js';
  import TargetCard from '../components/TargetCard.svelte';
  import { display } from '../settings/display.svelte.js';
  import {
    cycleMark,
    isAutomatic,
    markOf,
    observe,
    startDeduction,
    type Deduction,
  } from './deduction.js';

  interface Props {
    localiser: Localiser;
    view: View;
    seat: Seat;
  }

  let { localiser: l, view, seat }: Props = $props();
  const uid = $props.id();

  // Kept so cards seen earlier in the round stay marked after they leave the hand.
  let seen = $state.raw<Deduction>(startDeduction(0));
  const current = $derived(observe(seen, view, seat));
  $effect.pre(() => {
    seen = current;
  });

  function cardProps(card: Card) {
    const auto = display.deductionAutoMark;
    const mark = markOf(current, card, auto);
    if (isAutomatic(current, card, auto)) {
      const reason = l.t(mark === 'mine' ? 'deduction-mine' : 'deduction-revealed');
      return { state: 'disabled' as const, reason, mark: undefined };
    }
    const ruledOut = mark === 'ruled-out';
    return {
      state: ruledOut ? ('ruled-out' as const) : ('normal' as const),
      reason: undefined,
      mark: l.t(ruledOut ? 'deduction-ruled-out' : 'deduction-possible'),
    };
  }
</script>

<section aria-labelledby="{uid}-heading" aria-describedby="{uid}-help" data-testid="deduction">
  <h3 id="{uid}-heading">{l.t('deduction-heading')}</h3>
  <p id="{uid}-help" class="note">{l.t('deduction-help')}</p>
  <ul class="cards">
    {#each TARGET_CARDS as card (targetId(card))}
      {@const shown = cardProps(card)}
      <li data-testid="deduction-{targetId(card)}">
        <TargetCard
          localiser={l}
          {card}
          state={shown.state}
          reason={shown.reason}
          mark={shown.mark}
          onselect={() => (seen = cycleMark(current, card, display.deductionAutoMark))}
        />
      </li>
    {/each}
  </ul>
</section>

<style>
  h3 {
    font-size: 1rem;
    margin: 0;
  }

  .note {
    margin: 0 0 0.5rem;
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
