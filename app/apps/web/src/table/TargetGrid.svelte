<script lang="ts">
  import type { Character, TargetCard as Card } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { TARGET_CARDS, targetId } from '../cards.js';
  import type { CardState } from '../components/CardButton.svelte';
  import TargetCard from '../components/TargetCard.svelte';
  import Panel from '../kit/Panel.svelte';
  import { isInHand } from './targets.js';

  interface Props {
    localiser: Localiser;
    /** The player's own hand; its characters carry the "In hand" pill. */
    hand: readonly Character[];
    /** How each card is drawn, and why it can't be chosen while it is disabled. */
    shown?: (card: Card) => { state: CardState; reason?: string };
    /** Chooses or clears a target; without it the grid only shows the cards. */
    onselect?: (card: Card) => void;
  }

  let { localiser: l, hand, shown = () => ({ state: 'normal' }), onselect }: Props = $props();
</script>

<Panel title={l.t('plan-targets-heading')} tight class="target-grid" data-testid="plan-targets">
  <ul class="grid">
    {#each TARGET_CARDS as card (targetId(card))}
      {@const drawn = shown(card)}
      <li data-card={targetId(card)}>
        <TargetCard
          localiser={l}
          {card}
          size="target"
          state={drawn.state}
          reason={drawn.reason}
          inHand={isInHand(card, hand)}
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
    padding: 5px 6px;
  }

  :global(.panel.target-grid > .label) {
    margin: 0 0 2px 4px;
  }

  /* Five to a row, or as many as fit when larger text makes the cards wider. */
  .grid {
    display: grid;
    --column-gap: 4px;
    gap: 3px var(--column-gap);
    grid-template-columns: repeat(auto-fill, var(--card-target-width));
    justify-content: center;
    list-style: none;
    margin: 0 auto;
    max-width: calc(5 * var(--card-target-width) + 4 * var(--column-gap));
    padding: 0;
    width: 100%;
  }

  .grid li {
    display: flex;
    margin: 0;
  }
</style>
