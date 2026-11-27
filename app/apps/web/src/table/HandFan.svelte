<script lang="ts">
  import type { Character } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import CharacterCard from '../components/CharacterCard.svelte';

  interface Props {
    localiser: Localiser;
    hand: readonly Character[];
    /** The card drawn raised, as the plan's character. */
    chosen?: Character | null;
    /** Chooses a card; without it the hand is only shown. */
    onchoose?: (character: Character) => void;
    /** The cards that can be chosen; the others are drawn disabled. Every card by default. */
    offered?: readonly Character[];
    /** The reason shown for a card that can't be chosen. */
    reason?: string;
    testId: string;
  }

  let {
    localiser: l,
    hand,
    chosen = null,
    onchoose,
    offered = hand,
    reason,
    testId,
  }: Props = $props();
  const uid = $props.id();
</script>

<section class="hand" aria-labelledby="{uid}-heading">
  <h2 id="{uid}-heading" class="visually-hidden">{l.t('my-hand-heading')}</h2>
  {#if hand.length === 0}
    <p class="empty">{l.t('my-hand-empty')}</p>
  {:else}
    <ul class="fan" data-testid={testId}>
      {#each hand as c (c)}
        {@const choosable = offered.includes(c)}
        <li data-testid={onchoose === undefined ? `card-${c}` : undefined}>
          <CharacterCard
            localiser={l}
            character={c}
            size="medium"
            state={chosen === c ? 'selected' : choosable ? 'normal' : 'disabled'}
            reason={choosable ? undefined : reason}
            testId={onchoose === undefined ? undefined : `plan-character-${c}`}
            onselect={onchoose === undefined ? undefined : () => onchoose(c)}
          />
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .hand {
    flex: none;
    margin-top: auto;
  }

  .empty {
    margin: 0;
  }

  .fan {
    display: flex;
    justify-content: center;
    list-style: none;
    margin: 0;
    padding: 7px 0 0;
  }

  /* Short of room, the cards overlap further rather than leave the screen; the last shows whole. */
  .fan li {
    display: flex;
    flex: 0 1 auto;
    margin: 0;
    min-width: 0;
    position: relative;
  }

  .fan li:last-child {
    flex-shrink: 0;
  }

  .fan li + li {
    margin-inline-start: -30px;
  }

  /* Only the chosen card, the one being previewed or the one with keyboard focus is drawn on top. */
  .fan li:has(:global(.frame.selected, .hit:focus-visible, [data-part='popover'])) {
    z-index: 1;
  }
</style>
