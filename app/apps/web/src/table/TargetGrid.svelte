<script lang="ts">
  import type { Character, TargetCard as Card } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { targetId } from '../cards.js';
  import type { CardState } from '../components/CardButton.svelte';
  import TargetCard from '../components/TargetCard.svelte';
  import Panel from '../kit/Panel.svelte';
  import { shownTargets } from './targets.js';

  interface Props {
    localiser: Localiser;
    /** The player's own hand, whose characters are left out of the grid. */
    hand: readonly Character[];
    /** How each card is drawn, and why it can't be chosen while it is disabled. */
    shown?: (card: Card) => { state: CardState; reason?: string };
    /** Chooses or clears a target; without it the grid only shows the cards. */
    onselect?: (card: Card) => void;
  }

  let { localiser: l, hand, shown = () => ({ state: 'normal' }), onselect }: Props = $props();
  const cards = $derived(shownTargets(hand));
</script>

<Panel title={l.t('plan-targets-heading')} tight class="target-grid" data-testid="plan-targets">
  <ul class="grid">
    {#each cards as card (targetId(card))}
      {@const drawn = shown(card)}
      <li data-card={targetId(card)}>
        <TargetCard
          localiser={l}
          {card}
          size="target"
          state={drawn.state}
          reason={drawn.reason}
          onselect={onselect === undefined ? undefined : () => onselect(card)}
          testId={onselect === undefined ? undefined : `target-${targetId(card)}`}
        />
      </li>
    {/each}
  </ul>
</Panel>

<style>
  :global(.panel.target-grid) {
    flex: none;
    padding: 4px 6px;
  }

  :global(.panel.target-grid > .label) {
    margin: 0 0 2px 4px;
  }

  /* Three to a row, drawn 5 % larger, or as many as fit when larger text makes the cards wider. */
  .grid {
    --zoom: 1.05;
    --column: calc(var(--zoom) * var(--card-target-width));
    display: grid;
    --column-gap: 6px;
    gap: 2px var(--column-gap);
    grid-template-columns: repeat(auto-fill, var(--column));
    justify-content: center;
    list-style: none;
    margin: 0 auto;
    max-width: calc(3 * var(--column) + 2 * var(--column-gap));
    padding: 0;
    width: 100%;
  }

  .grid li {
    display: flex;
    margin: 0;
    zoom: var(--zoom);
  }
</style>
