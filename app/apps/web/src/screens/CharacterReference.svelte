<script lang="ts">
  import type { TargetCard as Card } from '@wwd/engine';
  import { richMessage, type Localiser, type RichPart } from '@wwd/client-core';
  import AbilityLegend from '../components/AbilityLegend.svelte';
  import CardFace from '../components/CardFace.svelte';
  import Screen from '../components/Screen.svelte';
  import { CHARACTERS, NO_PILLS, faction, initiative, pillsOf } from '../cards.js';
  import ListRow from '../kit/ListRow.svelte';
  import Panel from '../kit/Panel.svelte';
  import RichText from '../kit/RichText.svelte';
  import { abilityParts, cardText, characterName, printedName } from '../text.js';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();

  const CARDS: readonly Card[] = [...CHARACTERS.map((character) => ({ character })), 'fool'];

  /** Stands for the printed name while the line around it is formatted. */
  const NAME = '\u{E0FF}';

  /** The line giving the card's English printed name, split around the name, or null in English. */
  function printedLine(card: Card): { before: string; name: string; after: string } | null {
    const name = printedName(l, card);
    if (name === null) return null;
    const line = l.t('reference-printed-name', { name: NAME });
    const at = line.indexOf(NAME);
    if (at === -1) return { before: line, name: '', after: '' };
    return { before: line.slice(0, at), name, after: line.slice(at + NAME.length) };
  }

  /** The card's name, initiative and faction, with the name in bold. */
  function title(card: Card): RichPart[] {
    if (card === 'fool') return [{ character: l.t('card-fool') }];
    return richMessage(
      l,
      'card-character',
      {
        character: card.character,
        initiative: initiative(card.character),
        faction: l.t(`faction-${faction(card.character)}`),
      },
      { character: 'character' },
    );
  }
</script>

<Screen title={l.t('reference-heading')} testId="how-to-play" back={l.t('back')} tight>
  <Panel>
    <AbilityLegend localiser={l} level="h2" />
  </Panel>
  <Panel title={l.t('reference-characters-heading')}>
    <p class="note intro">{l.t('reference-characters-intro')}</p>
    <ul class="cards" data-testid="reference-characters">
      {#each CARDS as card (card === 'fool' ? card : card.character)}
        {@const printed = printedLine(card)}
        <ListRow>
          <div class="character">
            <span class="picture">
              {#if card === 'fool'}
                <CardFace
                  name={l.t('card-fool')}
                  faction="neutral"
                  initiative={null}
                  art="fool"
                  size="medium"
                  pills={NO_PILLS}
                  text={cardText(l, card)}
                />
              {:else}
                <CardFace
                  name={characterName(l, card.character)}
                  faction={faction(card.character)}
                  initiative={initiative(card.character)}
                  art={card.character}
                  size="medium"
                  pills={pillsOf(card.character)}
                  text={cardText(l, card)}
                />
              {/if}
            </span>
            <div class="words">
              <p data-part="reference-name"><RichText parts={title(card)} /></p>
              {#if printed !== null}
                <p class="note" data-part="printed-name">
                  {printed.before}<span lang="en">{printed.name}</span>{printed.after}
                </p>
              {/if}
              <p data-part="reference-ability"><RichText parts={abilityParts(l, card)} /></p>
            </div>
          </div>
        </ListRow>
      {/each}
    </ul>
  </Panel>
</Screen>

<style>
  .intro {
    margin: 0 0 4px;
  }

  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .character {
    align-items: center;
    display: flex;
    gap: 12px;
  }

  .picture {
    flex: none;
    height: var(--card-medium-height);
    position: relative;
    width: var(--card-medium-width);
  }

  .words p {
    margin: 0;
  }

  .words p + p {
    margin-top: 4px;
  }
</style>
