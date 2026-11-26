<script lang="ts">
  import type { Character, Event, Seat } from '@wwd/engine';
  import { richMessage, type Localiser } from '@wwd/client-core';
  import CharacterCard from '../components/CharacterCard.svelte';
  import Label from '../kit/Label.svelte';
  import RichText from '../kit/RichText.svelte';
  import { logParts } from '../text.js';
  import { handInstruction } from './primary.svelte.js';
  import { showdownSteps } from './showdown.js';

  interface Props {
    localiser: Localiser;
    events: Array<[number, Event]>;
    seat: Seat;
    /** The round to sum up. */
    round: number;
    /** Marks the summary as the latest showdown result. */
    latest?: boolean;
    /** Draws the set-aside card smaller, for a screen short of room. */
    compact?: boolean;
  }

  let { localiser: l, events, seat, round, latest = false, compact = false }: Props = $props();
  const uid = $props.id();

  interface Summary {
    /** Who takes the Badge, or null when the game ended with the round. */
    nextBadge: Seat | null;
    setAside: Character | null;
    /** The round's results, one per step, when the game ended with the round. */
    results: Array<[number, Event][]>;
  }

  /** How the round ended, once it has: the Badge and the card set aside, or the last results. */
  const summary = $derived.by((): Summary | null => {
    const start = events.findIndex(
      ([, event]) => 'round_started' in event.kind && event.kind.round_started.round === round,
    );
    if (start === -1) return null;
    const end = events.findIndex(
      ([, event], i) => i > start && ('round_ended' in event.kind || 'game_over' in event.kind),
    );
    const ended = events[end]?.[1].kind;
    if (ended === undefined) return null;
    if (!('round_ended' in ended)) {
      return {
        nextBadge: null,
        setAside: null,
        results: showdownSteps(events.slice(start, end + 1)),
      };
    }
    const after = events[end + 1]?.[1].kind;
    const setAside =
      after !== undefined && 'discard_revealed' in after ? after.discard_revealed.character : null;
    return { nextBadge: ended.round_ended.next_badge, setAside, results: [] };
  });

  // The summary says who takes the Badge, so the phase bar drops its rules hint about it.
  handInstruction(
    () => roundOverInstruction,
    () => latest && summary !== null && summary.nextBadge !== null,
  );

  const badge = $derived.by(() => {
    if (summary === null || summary.nextBadge === null) return [];
    const who = summary.nextBadge === seat ? 'you' : 'opponent';
    return richMessage(
      l,
      'round-summary-badge',
      {
        who,
        player: l.t(who === 'you' ? 'player-you-cap' : 'player-opponent-cap'),
        badge: l.t('marker-badge'),
        next: round + 1,
      },
      { player: 'player', badge: { marker: 'badge' } },
    );
  });
</script>

{#snippet roundOverInstruction()}{l.t('phase-round-over')}{/snippet}

{#if summary !== null}
  <section
    class={['summary', { latest, compact }]}
    aria-labelledby="{uid}-heading"
    data-testid="round-summary"
  >
    <Label as="h3" id="{uid}-heading">{l.t('round-summary', { round })}</Label>
    <div class="row">
      {#if summary.setAside !== null}
        <CharacterCard
          localiser={l}
          character={summary.setAside}
          size="target"
          testId="round-set-aside-card"
        />
      {/if}
      <div class="text">
        {#if summary.setAside !== null}
          <p data-testid="round-set-aside">
            <RichText
              parts={richMessage(
                l,
                'round-summary-set-aside',
                { character: summary.setAside },
                { character: 'character' },
              )}
            />
          </p>
        {/if}
        {#if summary.nextBadge !== null}
          <p data-testid="round-badge"><RichText parts={badge} /></p>
        {/if}
      </div>
    </div>
    {#if summary.results.length > 0}
      <ol class="results">
        {#each summary.results as step (step[0]![0])}
          <li>
            {#each step as [seq, event], j (seq)}{j > 0 ? ' ' : ''}<RichText
                parts={logParts(l, event, seat)}
              />{/each}
          </li>
        {/each}
      </ol>
    {/if}
  </section>
{/if}

<style>
  .summary {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 8%, transparent);
    flex: none;
    padding: 7px 9px;
  }

  .latest {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent);
  }

  @media (forced-colors: active) {
    .latest {
      outline: 2px solid CanvasText;
    }
  }

  .row {
    align-items: center;
    display: flex;
    gap: 10px;
  }

  .compact .row > :global(.slot) {
    zoom: 0.6;
  }

  .text {
    display: grid;
    font-size: 0.8125rem;
    gap: 4px;
    min-width: 0;
  }

  p {
    margin: 0;
  }

  .results {
    display: grid;
    font-size: 0.8125rem;
    gap: 2px;
    margin: 0;
    padding-inline-start: 1.25rem;
  }

  .results li {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
