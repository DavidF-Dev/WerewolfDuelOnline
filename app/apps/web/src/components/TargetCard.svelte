<script lang="ts">
  import type { TargetCard } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { faction, initiative } from '../cards.js';
  import { characterLabel, characterName } from '../text.js';
  import CardButton, { type CardState } from './CardButton.svelte';

  interface Props {
    localiser: Localiser;
    card: TargetCard;
    state?: CardState;
    /** Why the card can't be chosen; shown while it is disabled. */
    reason?: string;
    /** A short status shown under the card and announced with it. */
    mark?: string;
    onselect?: () => void;
    testId?: string;
  }

  let { localiser: l, card, state, reason, mark, onselect, testId }: Props = $props();
</script>

{#if card === 'fool'}
  <CardButton
    label={l.t('card-fool-name', { ability: l.t('card-ability-fool') })}
    name={l.t('card-fool')}
    faction="neutral"
    initiative={null}
    art="fool"
    {state}
    {reason}
    {mark}
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
    {state}
    {reason}
    {mark}
    {onselect}
    {testId}
  />
{/if}
