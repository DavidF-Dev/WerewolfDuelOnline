<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import type { Command, Seat } from '@wwd/engine';
  import type { GameClientState, Localiser } from '@wwd/client-core';
  import LogDrawer from '../table/LogDrawer.svelte';
  import MyArea from '../table/MyArea.svelte';
  import OpponentStrip from '../table/OpponentStrip.svelte';
  import PhaseBar from '../table/PhaseBar.svelte';
  import TableArea from '../table/TableArea.svelte';
  import GameMenu from '../table/GameMenu.svelte';
  import GameOver from '../table/GameOver.svelte';
  import PausedPanel from '../table/PausedPanel.svelte';
  import RoundSummary from '../table/RoundSummary.svelte';
  import { buzz } from '../haptics.js';
  import { display } from '../settings/display.svelte.js';
  import { problemText, rejectionText, statusText } from '../text.js';

  interface Props {
    localiser: Localiser;
    state: GameClientState;
    onCommand: (cmd: Command) => void;
    /** A Fluent id for a problem found on this side, such as a command that could not be sent. */
    notice?: string | null;
    /** Whether the connection notices use the local wording; online ones come from `children`. */
    mode?: 'local' | 'online';
    /** Shown below the heading, such as connection details. */
    children?: Snippet;
    /** Extra game menu items, such as continuing on another device. */
    menu?: Snippet;
    /** Resigns this seat; the menu offers Resign only while this is given. */
    onResign?: () => void;
    /** Asks for a pause once the round ends; the menu leaves the item out while this is undefined. */
    onPause?: () => void;
    /** Answers the pause; the pause panel is left out while this is undefined. */
    pauseActions?: { accept: () => void; cancel: () => void; resume: () => void };
    /** Shown in the pause panel while paused, such as an invite. */
    paused?: Snippet;
    /** Asks for a rematch after game over; Rematch is left out while this is undefined. */
    onRematch?: () => void;
    /** Opens the finished game's replay; View replay is left out while this is undefined. */
    onViewReplay?: () => void;
  }

  let {
    localiser: l,
    state,
    onCommand,
    notice = null,
    mode = 'local',
    children,
    menu,
    onResign,
    onPause,
    pauseActions,
    paused,
    onRematch,
    onViewReplay,
  }: Props = $props();
  const uid = $props.id();
  let root: HTMLElement | undefined;

  const other = (seat: Seat): Seat => (seat === 'p0' ? 'p1' : 'p0');
  const index = (seat: Seat): 0 | 1 => (seat === 'p0' ? 0 : 1);

  const view = $derived(state.view);
  const seat = $derived(state.seat);
  const opponentSeat = $derived(seat === null ? null : other(seat));
  const names = $derived.by((): Record<Seat, string> => {
    const opponentName = (s: Seat): string => state.opponent.name ?? l.t(`seat-${s}`);
    return {
      p0: seat === 'p0' ? l.t('table-you') : opponentName('p0'),
      p1: seat === 'p1' ? l.t('table-you') : opponentName('p1'),
    };
  });
  const gameOverEvent = $derived(state.events.find(([, event]) => 'game_over' in event.kind)?.[1]);
  const problem = $derived(
    notice ??
      (state.status === 'rejected' || state.status === 'game_over' ? null : state.lastError),
  );

  const roundOver = $derived(
    view !== null &&
      (view.phase === 'round_over' ||
        (typeof view.phase === 'object' && 'game_over' in view.phase)),
  );
  // A pause can be asked for only while nothing about one is open yet.
  const pausable = $derived(
    state.status === 'playing' && state.pause.requestedBy === null && !state.pause.paused,
  );

  // Changes only when what this seat is asked to do changes, not on every message.
  const phaseKey = $derived(
    `${state.game}|${state.status}|${view?.round ?? 0}|${state.pending?.kind ?? 'none'}|${state.legal.length > 0}|${state.pause.paused}`,
  );

  /** Moves focus to the first thing to do now, or to the heading of the region that explains why there is nothing. */
  function focusPhase(): void {
    if (root === undefined) return;
    const active = document.activeElement;
    const typing =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement ||
      (active instanceof HTMLElement && active.isContentEditable);
    if (typing && active.isConnected) return;
    const target =
      root.querySelector<HTMLElement>('[data-focus="game-over"]') ??
      root.querySelector<HTMLElement>('[data-focus="paused"]') ??
      root.querySelector<HTMLElement>('[data-phase-focus]:not([aria-disabled="true"])') ??
      root.querySelector<HTMLElement>(
        '[data-testid="plan-characters"] button:enabled, [data-testid="phase-actions"] li button:enabled',
      ) ??
      root.querySelector<HTMLElement>('[data-testid="phase-actions"] h2');
    target?.focus();
  }

  $effect(() => {
    void phaseKey;
    untrack(focusPhase);
  });

  // Names the offer this seat holds, so a reconnect that brings back the same offer stays silent.
  const offer = $derived(
    state.legal.length > 0 ? `${view?.round ?? 0}|${state.pending?.kind ?? 'none'}` : null,
  );
  // A rematch replaces the whole table, so its start is read out here.
  const openedGame = untrack(() => state.game);
  const rematchAnnouncement = $derived(
    state.game === openedGame ? '' : l.t('rematch-started', { number: state.game + 1 }),
  );

  let buzzedFor: string | null = null;
  $effect(() => {
    const now = offer;
    if (now === null || now === buzzedFor) return;
    buzzedFor = now;
    if (display.haptics) buzz();
  });
</script>

<main aria-labelledby="{uid}-heading" data-testid="table" bind:this={root}>
  <h1 id="{uid}-heading">{l.t('table-heading')}</h1>
  {#if mode === 'local'}
    <p role="status" data-testid="connection-status">
      {l.t('table-status', { status: statusText(l, state.status) })}
    </p>
    {#if state.status === 'disconnected'}
      <p role="alert" data-testid="disconnected">{l.t('status-disconnected-detail')}</p>
    {:else if state.status === 'rejected'}
      <p role="alert" data-testid="rejected">{rejectionText(l, state.lastError)}</p>
    {/if}
  {/if}
  {@render children?.()}
  <p role="status" data-testid="problem">
    {problem === null
      ? ''
      : l.t('problem-last', { detail: problemText(l, problem, mode === 'online') })}
  </p>

  <p role="status" class="visually-hidden" data-testid="game-announcement">
    {rematchAnnouncement}
  </p>

  {#if state.status === 'game_over' && seat !== null}
    <GameOver
      localiser={l}
      {seat}
      gameOver={gameOverEvent}
      replayVerified={state.replayVerified}
      rematchReady={state.rematchReady}
      {onRematch}
      {onViewReplay}
    />
  {/if}

  {#if pauseActions !== undefined && seat !== null}
    <PausedPanel
      localiser={l}
      pause={state.pause}
      {seat}
      onAccept={pauseActions.accept}
      onCancel={pauseActions.cancel}
      onResume={pauseActions.resume}
      children={paused}
    />
  {/if}

  {#if view !== null && seat !== null && opponentSeat !== null}
    {#key state.game}
      <div class="layout">
        <GameMenu
          localiser={l}
          {view}
          {seat}
          canResign={state.status === 'playing' && !state.pause.paused && onResign !== undefined}
          onResign={() => onResign?.()}
          onPause={pausable ? onPause : undefined}
          children={menu}
        />
        <OpponentStrip
          localiser={l}
          name={names[opponentSeat]}
          connected={state.opponent.connected}
          player={view.players[index(opponentSeat)]}
          hasBadge={view.badge === opponentSeat}
        />
        <TableArea localiser={l} {view} {seat} events={state.events} {names} />
        <MyArea localiser={l} name={l.t(`seat-${seat}`)} {view} {seat} />
        <PhaseBar localiser={l} {state} {view} {seat} {onCommand} onCaughtUp={focusPhase} />
        {#if roundOver}
          <RoundSummary localiser={l} events={state.events} {seat} round={view.round} />
        {/if}
        <LogDrawer
          localiser={l}
          events={state.events}
          {seat}
          tiebreak={state.config?.tiebreak ?? null}
        />
      </div>
    {/key}
  {/if}
</main>

<style>
  .layout {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: minmax(0, 1fr);
    margin-block-end: 1.5rem;
  }
</style>
