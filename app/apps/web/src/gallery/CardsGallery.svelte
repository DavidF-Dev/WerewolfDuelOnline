<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import { CHARACTERS, TARGET_CARDS, targetId } from '../cards.js';
  import AbilityLegend from '../components/AbilityLegend.svelte';
  import type { CardSize, CardState } from '../components/CardButton.svelte';
  import CharacterCard from '../components/CharacterCard.svelte';
  import Screen from '../components/Screen.svelte';
  import TargetCard from '../components/TargetCard.svelte';
  import Panel from '../kit/Panel.svelte';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();

  const SIZES: readonly { size: CardSize; title: string }[] = [
    { size: 'large', title: 'Large' },
    { size: 'medium', title: 'Medium' },
    { size: 'target', title: 'Target' },
  ];

  interface Shown {
    title: string;
    state: CardState;
    reason?: string;
  }

  const shownStates: readonly Shown[] = $derived([
    { title: 'Selected', state: 'selected' },
    { title: 'Disabled with its reason', state: 'disabled', reason: l.t('target-not-allowed') },
  ]);
</script>

<Screen title="Cards" testId="cards-gallery">
  {#each SIZES as { size, title } (size)}
    <Panel {title}>
      <ul class="cards" data-size={size}>
        {#each TARGET_CARDS as card (targetId(card))}
          <li data-card={targetId(card)}>
            <TargetCard localiser={l} {card} {size} onselect={() => undefined} />
          </li>
        {/each}
      </ul>
    </Panel>
  {/each}
  {#each shownStates as shown (shown.title)}
    <Panel title={shown.title}>
      <ul class="cards" data-size="target" data-state={shown.title}>
        {#each TARGET_CARDS.slice(0, 5) as card (targetId(card))}
          <li data-card={targetId(card)}>
            <TargetCard
              localiser={l}
              {card}
              size="target"
              state={shown.state}
              reason={shown.reason}
              onselect={() => undefined}
            />
          </li>
        {/each}
      </ul>
    </Panel>
  {/each}
  <Panel title="A hand">
    <ul class="cards hand" data-size="medium" data-state="hand">
      {#each CHARACTERS.slice(0, 4) as character, i (character)}
        <li data-card={character}>
          <CharacterCard
            localiser={l}
            {character}
            size="medium"
            state={i === 0 ? 'selected' : 'normal'}
            onselect={() => undefined}
          />
        </li>
      {/each}
    </ul>
  </Panel>
  <Panel>
    <AbilityLegend localiser={l} />
  </Panel>
</Screen>

<style>
  .cards {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 12px;
    list-style: none;
    margin: 0;
    padding: 8px 0 0;
  }

  .cards li {
    margin: 0;
  }
</style>
