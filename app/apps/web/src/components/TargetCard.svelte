<script lang="ts">
  import type { TargetCard } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { NO_PILLS, faction, initiative, pillsOf } from '../cards.js';
  import { abilityText, cardText, characterLabel, characterName } from '../text.js';
  import CardButton, { type CardSize, type CardState } from './CardButton.svelte';

  interface Props {
    localiser: Localiser;
    card: TargetCard;
    size?: CardSize;
    state?: CardState;
    /** Why the card can't be chosen: announced while it is disabled, and shown on focus or a tap. */
    reason?: string;
    onselect?: () => void;
    testId?: string;
  }

  let { localiser: l, card, size, state, reason, onselect, testId }: Props = $props();
</script>

{#if card === 'fool'}
  <CardButton
    label={l.t('card-fool-name', { ability: abilityText(l, card) })}
    name={l.t('card-fool')}
    faction="neutral"
    initiative={null}
    art="fool"
    pills={NO_PILLS}
    text={cardText(l, card)}
    {size}
    {state}
    {reason}
    {onselect}
    {testId}
  />
{:else}
  <CardButton
    label={characterLabel(l, card.character, initiative(card.character))}
    name={characterName(l, card.character)}
    faction={faction(card.character)}
    initiative={initiative(card.character)}
    art={card.character}
    pills={pillsOf(card.character)}
    text={cardText(l, card)}
    {size}
    {state}
    {reason}
    {onselect}
    {testId}
  />
{/if}
