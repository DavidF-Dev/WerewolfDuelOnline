<script lang="ts">
  import type { Event, PlayerView, Seat } from '@wwd/engine';
  import { richMessage, type Localiser, type RichPart } from '@wwd/client-core';
  import Button from '../components/Button.svelte';
  import MarkerIcon from '../components/MarkerIcon.svelte';
  import HistoryGame from '../history/HistoryGame.svelte';
  import HistoryTotals from '../history/HistoryTotals.svelte';
  import { listHistory } from '../history/list.js';
  import Panel from '../kit/Panel.svelte';
  import RichText from '../kit/RichText.svelte';
  import Spinner from '../kit/Spinner.svelte';
  import type { HistoryRecord } from '../storage/db.js';

  interface Props {
    localiser: Localiser;
    seat: Seat;
    /** The event that ended the game, once it has arrived. */
    gameOver: Event | undefined;
    /** The round the game ended in. */
    round: number;
    /** This seat's markers at the end. */
    player: PlayerView;
    /** How the opponent is named in the result. */
    opponentName: string;
    /** The seats that have asked for a rematch. */
    rematchReady: Seat[];
    /** Asks for a rematch; Rematch is left out while this is undefined. */
    onRematch?: () => void;
    /** Opens the finished game's replay; View replay is left out while this is undefined. */
    onViewReplay?: () => void;
  }

  let {
    localiser: l,
    seat,
    gameOver,
    round,
    player,
    opponentName,
    rematchReady,
    onRematch,
    onViewReplay,
  }: Props = $props();

  /** How many past games the History panel lists. */
  const RECENT = 3;

  const asked = $derived(rematchReady.includes(seat));
  const opponentAsked = $derived(rematchReady.some((s) => s !== seat));
  const result = $derived(
    gameOver !== undefined && 'game_over' in gameOver.kind ? gameOver.kind.game_over : null,
  );
  const won = $derived(result?.winner === seat);

  const how = $derived.by((): RichPart[] => {
    if (result === null) return [];
    const you = l.t('player-you-cap');
    return richMessage(
      l,
      'game-over-how',
      {
        reason: result.reason,
        winner: won ? you : opponentName,
        loser: won ? opponentName : you,
        health: l.t('marker-health'),
        fangs: l.t('marker-fangs'),
        crosses: l.t('marker-crosses'),
        round,
      },
      {
        winner: 'player',
        loser: 'player',
        health: { marker: 'health' },
        fangs: { marker: 'fang' },
        crosses: { marker: 'cross' },
      },
    );
  });

  let records = $state.raw<HistoryRecord[]>([]);
  // The finished game is recorded once the replay can be opened, so the list is read again then.
  const recorded = $derived(onViewReplay !== undefined);
  $effect(() => {
    void recorded;
    let active = true;
    void listHistory().then((list) => {
      if (active) records = list;
    });
    return () => {
      active = false;
    };
  });
</script>

<div class="over" data-testid="game-over">
  <Panel class="result" data-testid="game-over-result">
    {#if result !== null}
      <h2 class="big" tabindex="-1" data-focus="game-over">
        {l.t(won ? 'game-over-won' : 'game-over-lost')}
      </h2>
      <p class="how" data-testid="game-over-how"><RichText parts={how} /></p>
    {/if}
    <ul class="markers" aria-label={l.t('game-over-markers')} data-testid="game-over-markers">
      <li><MarkerIcon localiser={l} marker="health" count={player.health} compact /></li>
      <li><MarkerIcon localiser={l} marker="cross" count={player.cross} compact /></li>
      <li><MarkerIcon localiser={l} marker="fang" count={player.fang} compact /></li>
    </ul>
  </Panel>

  {#if onViewReplay !== undefined || onRematch !== undefined}
    <div class="actions">
      {#if onViewReplay !== undefined}
        <Button variant="primary" data-testid="view-replay" onclick={onViewReplay}
          >{l.t('game-over-view-replay')}</Button
        >
      {/if}
      {#if onRematch !== undefined}
        <!-- Stays in place once asked, so focus is not lost. -->
        <Button
          data-testid="rematch"
          aria-disabled={asked}
          onclick={() => {
            if (!asked) onRematch?.();
          }}>{l.t('rematch')}</Button
        >
      {/if}
    </div>
  {/if}
  {#if onRematch !== undefined}
    <div class="notes">
      <p role="status" data-testid="rematch-status">
        {#if asked}
          {l.t('rematch-waiting')}<Spinner />
        {:else if opponentAsked}
          {l.t('rematch-opponent-ready')}
        {/if}
      </p>
    </div>
  {/if}

  {#if records.length > 0}
    <Panel title={l.t('history-heading')} data-testid="game-over-history">
      <HistoryTotals localiser={l} {records} />
      <ul class="games">
        {#each records.slice(0, RECENT) as record (record.id)}
          <HistoryGame localiser={l} {record} />
        {/each}
      </ul>
    </Panel>
  {/if}
</div>

<style>
  .over {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .over :global(.result) {
    text-align: center;
  }

  p {
    margin: 0;
  }

  .big {
    font: 400 1.625rem/1.1 var(--font-display);
    margin: 4px 0;
  }

  .how {
    color: var(--muted);
  }

  .markers {
    align-items: center;
    display: flex;
    font-size: 0.875rem;
    gap: 14px;
    justify-content: center;
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
  }

  .markers li {
    align-items: center;
    display: flex;
    margin: 0;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .actions :global(.button) {
    flex: 1 1 0;
  }

  .notes {
    color: var(--muted);
    font-size: 0.75rem;
    text-align: center;
  }

  .games {
    list-style: none;
    margin: 0;
    padding: 0;
  }
</style>
