<script lang="ts">
  import type { Character } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { faction, initiative as printedInitiative, pillsOf } from '../cards.js';
  import { cardText, characterLabel, characterName } from '../text.js';
  import CardButton, { type CardSize, type CardState } from './CardButton.svelte';

  interface Props {
    localiser: Localiser;
    character: Character;
    /** The initiative to show; defaults to the printed one. */
    initiative?: number;
    size?: CardSize;
    state?: CardState;
    /** Why the card can't be chosen: announced while it is disabled, and shown on focus or a tap. */
    reason?: string;
    /** A description announced while the card is not disabled. */
    description?: string;
    onselect?: () => void;
    /** Whether choosing the card toggles it on and off, rather than acting at once. */
    toggle?: boolean;
    testId?: string;
  }

  let {
    localiser: l,
    character,
    initiative,
    size,
    state,
    reason,
    description,
    onselect,
    toggle,
    testId,
  }: Props = $props();
  const shown = $derived(initiative ?? printedInitiative(character));
</script>

<CardButton
  label={characterLabel(l, character, shown)}
  name={characterName(l, character)}
  faction={faction(character)}
  initiative={shown}
  art={character}
  pills={pillsOf(character)}
  text={cardText(l, { character })}
  {size}
  {state}
  {reason}
  {description}
  {onselect}
  {toggle}
  {testId}
/>
