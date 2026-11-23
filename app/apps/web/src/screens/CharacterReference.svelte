<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import CharacterCard from '../components/CharacterCard.svelte';
  import Screen from '../components/Screen.svelte';
  import TargetCard from '../components/TargetCard.svelte';
  import { CHARACTERS } from '../cards.js';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();
  const uid = $props.id();
</script>

<Screen title={l.t('reference-heading')} testId="how-to-play" backLabel={l.t('back')}>
  <section aria-labelledby="{uid}-characters">
    <h2 id="{uid}-characters">{l.t('reference-characters-heading')}</h2>
    <p>{l.t('reference-characters-intro')}</p>
    <ul class="cards">
      {#each CHARACTERS as character (character)}
        <li>
          <CharacterCard localiser={l} {character} />
          <p>{l.t(`card-ability-${character.replaceAll('_', '-')}`)}</p>
        </li>
      {/each}
      <li>
        <TargetCard localiser={l} card="fool" />
        <p>{l.t('card-ability-fool')}</p>
      </li>
    </ul>
  </section>
</Screen>

<style>
  .cards {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .cards li {
    align-items: flex-start;
    display: flex;
    gap: 0.75rem;
    margin: 0;
  }

  .cards p {
    margin: 0;
  }
</style>
