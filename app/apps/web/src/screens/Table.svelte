<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import type { Command, Seat } from '@wwd/engine';
  import type { GameClientState, Localiser } from '@wwd/client-core';
  import EventLog from '../components/EventLog.svelte';
  import MyArea from '../components/MyArea.svelte';
  import OpponentStrip from '../components/OpponentStrip.svelte';
  import PhaseActions from '../components/PhaseActions.svelte';
  import PlanBuilder from '../components/PlanBuilder.svelte';
  import {
    characterName,
    instructionText,
    logLine,
    problemText,
    rejectionText,
    statusText,
  } from '../text.js';

  interface Props {
    localiser: Localiser;
    state: GameClientState;
    onCommand: (cmd: Command) => void;
    /** A Fluent id for a problem found on this side, such as a command that could not be sent. */
    notice?: string | null;
    /** Whether the connection notices use the local wording; online ones come from `children`. */
    mode?: 'local' | 'online';
    /** Shown below the heading, such as connection details and game menus. */
    children?: Snippet;
  }

  let { localiser: l, state, onCommand, notice = null, mode = 'local', children }: Props = $props();
  const uid = $props.id();
  let root: HTMLElement | undefined;

  const other = (seat: Seat): Seat => (seat === 'p0' ? 'p1' : 'p0');
  const index = (seat: Seat): 0 | 1 => (seat === 'p0' ? 0 : 1);

  const view = $derived(state.view);
  const seat = $derived(state.seat);
  const opponentSeat = $derived(seat === null ? null : other(seat));
  const canPlan = $derived(
    state.legal.some((cmd) => typeof cmd === 'object' && 'submit_plan' in cmd),
  );
  const instruction = $derived(instructionText(l, state));
  const gameOverEvent = $derived(state.events.find(([, event]) => 'game_over' in event.kind)?.[1]);
  const problem = $derived(
    notice ??
      (state.status === 'rejected' || state.status === 'game_over' ? null : state.lastError),
  );

  // Changes only when what this seat is asked to do changes, not on every message.
  const phaseKey = $derived(
    `${state.status}|${view?.round ?? 0}|${state.pending?.kind ?? 'none'}|${state.legal.length > 0}`,
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

  {#if state.status === 'game_over'}
    <section aria-labelledby="{uid}-over" data-testid="game-over">
      <h2 id="{uid}-over" tabindex="-1" data-focus="game-over">{l.t('game-over-heading')}</h2>
      {#if gameOverEvent !== undefined}
        <p data-testid="game-over-result">{logLine(l, gameOverEvent, seat)}</p>
      {/if}
      {#if state.replayVerified !== null}
        <p data-testid="replay-verified">
          {l.t(state.replayVerified ? 'replay-verified' : 'replay-unverified')}
        </p>
      {/if}
    </section>
  {/if}

  {#if view !== null && seat !== null && opponentSeat !== null}
    <p data-testid="round">{l.t('table-round', { round: view.round })}</p>
    {#if view.potion_target !== null}
      <p data-testid="potion-target">
        {l.t('potion-target', { card: characterName(l, view.potion_target.card) })}
      </p>
    {/if}
    <OpponentStrip
      localiser={l}
      name={state.opponent.name ?? l.t(`seat-${opponentSeat}`)}
      connected={state.opponent.connected}
      player={view.players[index(opponentSeat)]}
      hasBadge={view.badge === opponentSeat}
    />
    <MyArea
      localiser={l}
      name={l.t(`seat-${seat}`)}
      player={view.players[index(seat)]}
      hasBadge={view.badge === seat}
    />
    {#if canPlan}
      <PlanBuilder
        localiser={l}
        hand={view.players[index(seat)].hand ?? []}
        legal={state.legal}
        {onCommand}
        errorCount={state.errorCount}
      />
    {/if}
    <PhaseActions
      localiser={l}
      legal={state.legal}
      {instruction}
      {onCommand}
      errorCount={state.errorCount}
    />
    <EventLog localiser={l} events={state.events} {seat} />
  {/if}
</main>
