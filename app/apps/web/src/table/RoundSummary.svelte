<script lang="ts">
  import type { Event, Seat } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { logLine } from '../text.js';

  interface Props {
    localiser: Localiser;
    events: Array<[number, Event]>;
    seat: Seat;
    /** The round to sum up. */
    round: number;
  }

  let { localiser: l, events, seat, round }: Props = $props();

  // The round's own events: from its start to its end, or to the end of the game.
  const lines = $derived.by((): Array<[number, Event]> => {
    const start = events.findIndex(
      ([, event]) => 'round_started' in event.kind && event.kind.round_started.round === round,
    );
    if (start === -1) return [];
    const end = events.findIndex(
      ([, event], i) => i > start && ('round_ended' in event.kind || 'game_over' in event.kind),
    );
    return events.slice(start, end === -1 ? undefined : end + 1);
  });
</script>

{#if lines.length > 0}
  <details class="summary" data-testid="round-summary">
    <summary>{l.t('round-summary', { round })}</summary>
    <ol>
      {#each lines as [seq, event] (seq)}
        <li>{logLine(l, event, seat)}</li>
      {/each}
    </ol>
  </details>
{/if}

<style>
  .summary {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 0 0.75rem;
  }

  summary {
    cursor: pointer;
    font-weight: 700;
    padding-block: 0.625rem;
  }
</style>
