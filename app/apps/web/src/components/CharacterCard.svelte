<script lang="ts">
  import type { Character } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { faction, initiative as printedInitiative } from '../cards.js';
  import { characterLabel, characterName } from '../text.js';
  import CardButton, { type CardState } from './CardButton.svelte';

  interface Props {
    localiser: Localiser;
    character: Character;
    /** The initiative to show; defaults to the printed one. */
    initiative?: number;
    state?: CardState;
    /** Why the card can't be chosen; shown while it is disabled. */
    reason?: string;
    onselect?: () => void;
    /** Whether choosing the card toggles it on and off, rather than acting at once. */
    toggle?: boolean;
    testId?: string;
  }

  let {
    localiser: l,
    character,
    initiative,
    state,
    reason,
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
  {state}
  {reason}
  {onselect}
  {toggle}
  {testId}
/>
