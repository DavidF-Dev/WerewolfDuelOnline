<script lang="ts">
  import type { Character, TargetCard } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import CharacterCard from '../components/CharacterCard.svelte';
  import MarkerIcon from '../components/MarkerIcon.svelte';
  import { fitText } from '../components/fit-text.js';
  import { characterName, planText } from '../text.js';
  import { chipRows } from './chip-rows.js';

  interface Props {
    localiser: Localiser;
    who: 'you' | 'opponent';
    /** The character played, or null while it is face down. */
    character: Character | null;
    /** The printed and effective initiative, or null while it is unknown. */
    initiative: { printed: number; effective: number } | null;
    /** The cards the plan targets, in its order; null shows the placed-Hourglass pill instead. */
    targets: readonly TargetCard[] | null;
    /** The Hourglasses placed, or `choosing` while they are being chosen; null shows no pill. */
    placed: number | 'choosing' | null;
    /** Whether the side acts first (1) or second (2) in the showdown, said in its name. */
    position?: 1 | 2;
  }

  let { localiser: l, who, character, initiative, targets, placed, position }: Props = $props();

  const whoText = $derived(l.t(who === 'you' ? 'side-you' : 'side-opponent'));
  const known = $derived(character !== null && initiative !== null);
  const initiativeText = $derived(
    initiative === null || character === null
      ? l.t('side-initiative-hidden')
      : initiative.effective === initiative.printed
        ? l.t('side-initiative', { initiative: initiative.printed })
        : l.t('side-initiative-changed', initiative),
  );

  const targetText = (card: TargetCard): string =>
    l.t('side-target', {
      target: card === 'fool' ? l.t('plan-summary-fool') : characterName(l, card.character),
    });

  const label = $derived.by((): string => {
    if (character === null || initiative === null)
      return l.t('side-label-hidden', { who: whoText });
    const plan = planText(l, { character, targets: [...(targets ?? [])] });
    const shown =
      initiative.effective === initiative.printed
        ? l.t('side-label', { who: whoText, plan, initiative: initiative.printed })
        : l.t('side-label-changed', { who: whoText, plan, ...initiative });
    return position === undefined ? shown : l.t('side-label-ordered', { label: shown, position });
  });

  const pill = $derived(
    targets !== null || placed === null
      ? null
      : {
          text: placed === 'choosing' ? l.t('side-pill-choosing') : l.t('side-pill', { n: placed }),
          name:
            placed === 'choosing' ? l.t('side-placed-choosing') : l.t('side-placed', { n: placed }),
          muted: placed === 'choosing' || placed === 0,
        },
  );
</script>

<div class="side" role="group" aria-label={label} data-who={who}>
  {#if character !== null}
    <CharacterCard localiser={l} {character} size="target" />
  {:else}
    <span class="slot face-down" data-part="side-face-down" aria-hidden="true"></span>
  {/if}
  <div class="text">
    <span class="line who" data-part="side-who" aria-hidden="true" use:fitText>{whoText}</span>
    <span
      class="line initiative"
      class:muted={!known}
      data-part="side-initiative"
      aria-hidden="true"
      use:fitText>{initiativeText}</span
    >
    {#if targets !== null}
      <ul
        class="chips"
        data-part="side-targets"
        aria-hidden="true"
        {@attach chipRows((n) => l.t('side-more-targets', { n }), targets)}
      >
        {#each targets as card, i (i)}
          <li class="chip" data-part="side-target">{targetText(card)}</li>
        {/each}
        <li class="chip more" data-part="side-more" hidden></li>
      </ul>
    {:else if pill !== null}
      <span
        class="pill"
        class:muted={pill.muted}
        role="img"
        aria-label={pill.name}
        data-part="side-pill"
        ><MarkerIcon marker="hourglass" /><span aria-hidden="true">{pill.text}</span></span
      >
    {/if}
  </div>
</div>

<style>
  .side {
    align-items: flex-start;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 8%, transparent);
    box-sizing: border-box;
    display: flex;
    gap: 6px;
    height: 100%;
    padding: 6px;
  }

  .face-down {
    background: repeating-linear-gradient(45deg, var(--chip) 0 6px, var(--surface-2) 6px 12px);
    border: 2.5px solid var(--muted);
    border-radius: 7px;
    box-sizing: border-box;
    display: block;
    flex: none;
    height: var(--card-target-height);
    width: var(--card-target-width);
  }

  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    line-height: 1.25;
    min-width: 0;
  }

  .line {
    display: block;
  }

  .who {
    font-size: 0.8125rem;
    font-weight: 700;
  }

  .initiative {
    font-size: 0.75rem;
  }

  .muted {
    color: var(--muted);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    list-style: none;
    margin: 2px 0 0;
    padding: 0;
  }

  .chip {
    background: var(--chip);
    border-radius: 999px;
    box-sizing: border-box;
    font-size: 0.6875rem;
    line-height: 1.45;
    margin: 0;
    max-width: 100%;
    overflow: hidden;
    padding: 0 6px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip[hidden] {
    display: none;
  }

  .pill {
    --marker-size: 1.15em;
    align-items: center;
    align-self: flex-start;
    border: 1px solid var(--line);
    border-radius: 999px;
    display: inline-flex;
    font-size: 0.8125rem;
    font-weight: 700;
    gap: 3px;
    margin-top: 2px;
    padding: 1px 7px 1px 2px;
  }

  @media (forced-colors: active) {
    .face-down {
      background: Canvas;
      border-color: CanvasText;
    }

    .chip,
    .pill {
      border: 1px solid CanvasText;
    }
  }
</style>
