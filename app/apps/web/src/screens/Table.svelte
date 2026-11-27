<script lang="ts">
  import { tick, untrack, type Snippet } from 'svelte';
  import type { Command, Seat } from '@wwd/engine';
  import type { GameClientState, Localiser } from '@wwd/client-core';
  import Screen from '../components/Screen.svelte';
  import UnofficialNotice from '../components/UnofficialNotice.svelte';
  import IconButton from '../kit/IconButton.svelte';
  import GameMenu from '../table/GameMenu.svelte';
  import GameOver from '../table/GameOver.svelte';
  import HandFan from '../table/HandFan.svelte';
  import LogDrawer from '../table/LogDrawer.svelte';
  import MyArea from '../table/MyArea.svelte';
  import OpponentStrip from '../table/OpponentStrip.svelte';
  import PausedPanel from '../table/PausedPanel.svelte';
  import PhaseBar from '../table/PhaseBar.svelte';
  import PlanPanels from '../table/PlanPanels.svelte';
  import PlanSheet from '../table/PlanSheet.svelte';
  import RevealPanel from '../table/RevealPanel.svelte';
  import ShowdownList, { firstShown } from '../table/ShowdownList.svelte';
  import { showdownSteps } from '../table/showdown.js';
  import { shownMarkers } from '../table/shown-markers.js';
  import TargetGrid from '../table/TargetGrid.svelte';
  import { providePrimary } from '../table/primary.svelte.js';
  import { buzz } from '../haptics.js';
  import { display } from '../settings/display.svelte.js';
  import { targetId } from '../cards.js';
  import { problemText, rejectionText } from '../text.js';

  interface Props {
    localiser: Localiser;
    state: GameClientState;
    onCommand: (cmd: Command) => void;
    /** A Fluent id for a problem found on this side, such as a command that could not be sent. */
    notice?: string | null;
    /** Whether the connection notices use the local wording; online ones come from `banner`. */
    mode?: 'local' | 'online';
    /** Notices right under the bar, outside the scrolling middle, such as the connection banner. */
    banner?: Snippet;
    /** Shown at the top of the body, such as a saved game to resume. */
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
    state: client,
    onCommand,
    notice = null,
    mode = 'local',
    banner,
    children,
    menu,
    onResign,
    onPause,
    pauseActions,
    paused,
    onRematch,
    onViewReplay,
  }: Props = $props();
  let root: HTMLElement | undefined;
  const primary = providePrimary();
  let menuOpen = $state(false);
  let logOpen = $state(false);

  const other = (seat: Seat): Seat => (seat === 'p0' ? 'p1' : 'p0');
  const index = (seat: Seat): 0 | 1 => (seat === 'p0' ? 0 : 1);

  const view = $derived(client.view);
  const seat = $derived(client.seat);
  const opponentSeat = $derived(seat === null ? null : other(seat));
  const names = $derived.by((): Record<Seat, string> => {
    const opponentName = (s: Seat): string => client.opponent.name ?? l.t(`seat-${s}`);
    return {
      p0: seat === 'p0' ? l.t('table-you') : opponentName('p0'),
      p1: seat === 'p1' ? l.t('table-you') : opponentName('p1'),
    };
  });
  const gameOverEvent = $derived(client.events.find(([, event]) => 'game_over' in event.kind)?.[1]);
  const problem = $derived(
    notice ??
      (client.status === 'rejected' || client.status === 'game_over' ? null : client.lastError),
  );

  const phase = $derived(view?.phase ?? null);
  const finished = $derived(typeof phase === 'object' && phase !== null && 'game_over' in phase);
  const inShowdown = $derived(
    phase === 'round_over' ||
      finished ||
      (typeof phase === 'object' && phase !== null && 'hunter_choice' in phase),
  );
  const canPlan = $derived(
    client.legal.some((cmd) => typeof cmd === 'object' && 'submit_plan' in cmd),
  );
  const revealing = $derived(
    typeof phase === 'object' &&
      phase !== null &&
      ('reveal_hourglass' in phase || 'reveal_potion' in phase),
  );
  // The Hunter prompt lives in the showdown list, which must show while it is offered.
  const showdown = $derived(
    (view !== null && view.showdown !== null) ||
      client.legal.some((cmd) => typeof cmd === 'object' && 'hunter_spend_cross' in cmd),
  );
  const hand = $derived(seat === null ? [] : (view?.players[index(seat)].hand ?? []));
  // My own sealed plan is revealed to me.
  const myPlan = $derived.by(() => {
    const plan = seat === null ? 'none' : (view?.players[index(seat)].plan ?? 'none');
    return typeof plan === 'object' && 'revealed' in plan ? plan.revealed : null;
  });
  // The opponent waits for this seat when only this seat is asked to act, outside the plan.
  const waitingForMe = $derived(
    phase !== 'plan' &&
      seat !== null &&
      opponentSeat !== null &&
      (client.pending?.seats.includes(seat) ?? false) &&
      !(client.pending?.seats.includes(opponentSeat) ?? false),
  );
  // A pause can be asked for only while nothing about one is open yet.
  const pausable = $derived(
    client.status === 'playing' && client.pause.requestedBy === null && !client.pause.paused,
  );

  // The game and round whose showdown has shown all its results; a game ending in one shows them first.
  let shownAllFor = $state<string | null>(null);
  /** Whether the showdown's earlier results are collapsed for want of room. */
  let showdownTight = $state(false);
  const roundKey = $derived(`${client.game}|${view?.round ?? 0}`);
  // The steps the showdown list has shown this round, as it last reported them.
  let stepsShown = $state<{ round: string; shown: number } | null>(null);
  // During a showdown, even while paused, the markers are as of the list's last shown step.
  const steps = $derived(
    view !== null && seat !== null && showdown ? showdownSteps(client.events) : [],
  );
  const reportedShown = $derived(stepsShown?.round === roundKey ? stepsShown.shown : undefined);
  const markers = $derived(
    view === null
      ? null
      : shownMarkers(view.players, steps, reportedShown ?? firstShown(steps.length)),
  );
  const resignation = $derived(
    gameOverEvent !== undefined &&
      'game_over' in gameOverEvent.kind &&
      gameOverEvent.kind.game_over.reason === 'resignation',
  );
  // The game this mount saw unfinished; a game already over when it is opened skips its showdown.
  let liveFor = $state<number | null>(null);
  $effect.pre(() => {
    if (view !== null && !finished) liveFor = client.game;
  });
  const over = $derived(
    client.status === 'game_over' &&
      (liveFor !== client.game || !showdown || shownAllFor === roundKey || resignation),
  );

  const title = $derived(
    over
      ? l.t('game-over-heading')
      : view === null
        ? l.t('table-heading')
        : l.t(inShowdown ? 'table-round-showdown' : 'table-round', { round: view.round }),
  );

  // Changes only when what this seat is asked to do changes, not on every message.
  const phaseKey = $derived(
    `${client.game}|${client.status}|${over}|${view?.round ?? 0}|${client.pending?.kind ?? 'none'}|${client.legal.length > 0}|${client.pause.paused}`,
  );

  /** Moves focus to the first thing to do now, or to the instruction that explains why there is nothing. */
  function focusPhase(): void {
    if (root === undefined) return;
    const active = document.activeElement;
    const typing =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement ||
      (active instanceof HTMLElement && active.isContentEditable);
    if (typing && active.isConnected) return;
    // An open sheet or dialog keeps focus; a sheet that closes hands it on to what changed meanwhile.
    if (active instanceof HTMLElement && active.closest('dialog[open]') !== null) {
      focusMissed = true;
      return;
    }
    focusMissed = false;
    const target =
      root.querySelector<HTMLElement>('[data-focus="game-over"]') ??
      root.querySelector<HTMLElement>('[data-focus="paused"]') ??
      root.querySelector<HTMLElement>('[data-phase-focus]:not([aria-disabled="true"])') ??
      root.querySelector<HTMLElement>('[data-testid="phase-actions"] li button:enabled') ??
      // Until focus has been on the table, the screen's heading keeps it, not the instruction.
      (hadFocus ? root.querySelector<HTMLElement>('[data-testid="phase-instruction"]') : null);
    target?.focus();
  }

  let focusMissed = false;
  let hadFocus = false;
  // The panels hand their primary actions to the phase bar after they mount.
  const hostedKey = $derived(primary.shown.map((hosted) => hosted.id).join(','));

  $effect(() => {
    void phaseKey;
    void hostedKey;
    untrack(focusPhase);
  });

  /** Opens a sheet; only a change that arrives while it is open moves focus once it closes. */
  function openSheet(open: () => void): void {
    focusMissed = false;
    open();
  }

  /** Closes a sheet, then moves focus to the action that arrived while it was open. */
  async function closeSheet(close: () => void): Promise<void> {
    close();
    if (!focusMissed) return;
    await tick();
    focusPhase();
  }

  // Names the offer this seat holds, so a reconnect that brings back the same offer stays silent.
  const offer = $derived(
    client.legal.length > 0 ? `${view?.round ?? 0}|${client.pending?.kind ?? 'none'}` : null,
  );
  // A rematch replaces the whole table, so its start is read out here.
  const openedGame = untrack(() => client.game);
  const rematchAnnouncement = $derived(
    client.game === openedGame ? '' : l.t('rematch-started', { number: client.game + 1 }),
  );

  let buzzedFor: string | null = null;
  $effect(() => {
    const now = offer;
    if (now === null || now === buzzedFor) return;
    buzzedFor = now;
    if (display.haptics) buzz();
  });
</script>

{#snippet menuButton()}
  <IconButton
    icon="menu"
    label={l.t('menu-summary')}
    aria-haspopup="dialog"
    data-testid="game-menu-toggle"
    onclick={() => openSheet(() => (menuOpen = true))}
  />
{/snippet}

{#snippet logButton()}
  <IconButton
    icon="log"
    label={l.t('drawer-summary')}
    aria-haspopup="dialog"
    data-testid="log-toggle"
    onclick={() => openSheet(() => (logOpen = true))}
  />
{/snippet}

{#snippet unofficialNotice()}
  <UnofficialNotice localiser={l} placement="inline" />
{/snippet}

{#snippet phaseBar()}
  {#if view !== null && seat !== null}
    {#key client.game}
      <PhaseBar
        localiser={l}
        state={client}
        {view}
        {onCommand}
        hosted={primary.shown}
        hostedInstruction={primary.instruction}
      />
    {/key}
  {/if}
{/snippet}

<div class="frame" bind:this={root} onfocusin={() => (hadFocus = true)}>
  <Screen
    {title}
    testId="table"
    fit
    tight
    back={over ? l.t('back') : undefined}
    left={menuButton}
    right={logButton}
    {banner}
    footer={over ? undefined : phaseBar}
    note={over ? unofficialNotice : undefined}
  >
    {#if mode === 'local'}
      {#if client.status === 'disconnected'}
        <p class="alert" role="alert" data-testid="disconnected">
          {l.t('status-disconnected-detail')}
        </p>
      {:else if client.status === 'rejected'}
        <p class="alert" role="alert" data-testid="rejected">
          {rejectionText(l, client.lastError)}
        </p>
      {/if}
    {/if}
    {@render children?.()}
    <p
      role="status"
      class={['alert', { 'visually-hidden': problem === null }]}
      data-testid="problem"
    >
      {problem === null
        ? ''
        : l.t('problem-last', { detail: problemText(l, problem, mode === 'online') })}
    </p>
    <p role="status" class="visually-hidden" data-testid="game-announcement">
      {rematchAnnouncement}
    </p>
    {#if view !== null && seat !== null}
      {#if menuOpen}
        <GameMenu
          localiser={l}
          {view}
          {seat}
          canResign={client.status === 'playing' && !client.pause.paused && onResign !== undefined}
          onResign={() => {
            menuOpen = false;
            onResign?.();
          }}
          onPause={pausable && onPause !== undefined
            ? () => {
                menuOpen = false;
                onPause();
              }
            : undefined}
          onclose={() => void closeSheet(() => (menuOpen = false))}
          children={menu}
        />
      {/if}
      {#key client.game}
        <LogDrawer
          localiser={l}
          events={client.events}
          {seat}
          tiebreak={client.config?.tiebreak ?? null}
          open={logOpen}
          onclose={() => void closeSheet(() => (logOpen = false))}
        />
      {/key}
    {/if}

    {#if over && view !== null && seat !== null && opponentSeat !== null}
      <GameOver
        localiser={l}
        {seat}
        gameOver={gameOverEvent}
        round={view.round}
        player={view.players[index(seat)]}
        opponentName={client.opponent.name ?? l.t('player-opponent-cap')}
        rematchReady={client.rematchReady}
        {onRematch}
        {onViewReplay}
      />
    {:else}
      {#if view !== null && seat !== null && opponentSeat !== null}
        <OpponentStrip
          localiser={l}
          name={names[opponentSeat]}
          connected={client.opponent.connected}
          player={view.players[index(opponentSeat)]}
          hasBadge={view.badge === opponentSeat}
          markers={markers?.[index(opponentSeat)]}
          animate
          {waitingForMe}
        />
      {/if}

      <div class="middle" data-testid="phase-panels">
        {#if pauseActions !== undefined && seat !== null}
          <PausedPanel
            localiser={l}
            pause={client.pause}
            {seat}
            onAccept={pauseActions.accept}
            onCancel={pauseActions.cancel}
            onResume={pauseActions.resume}
            children={paused}
          />
        {/if}

        <!-- While paused, the pause panel stands alone, so only Resume is offered. -->
        {#if view !== null && seat !== null && !client.pause.paused}
          {#key client.game}
            {#if canPlan}
              <PlanSheet
                localiser={l}
                {hand}
                legal={client.legal}
                config={client.config}
                {onCommand}
                errorCount={client.errorCount}
              />
            {:else if phase === 'plan'}
              <TargetGrid
                localiser={l}
                {hand}
                shown={(card) => ({
                  state: myPlan?.targets.some((t) => targetId(t) === targetId(card))
                    ? 'selected'
                    : 'normal',
                })}
              />
              <HandFan localiser={l} {hand} chosen={myPlan?.character ?? null} testId="my-hand" />
            {/if}
            {#if revealing}
              <RevealPanel
                localiser={l}
                {view}
                {seat}
                events={client.events}
                legal={client.legal}
                {onCommand}
                tiebreak={client.config?.tiebreak ?? null}
                errorCount={client.errorCount}
              />
            {/if}
            {#if showdown}
              <PlanPanels
                localiser={l}
                {view}
                events={client.events}
                {seat}
                compact={showdownTight}
              />
              {#key view.round}
                <ShowdownList
                  localiser={l}
                  events={client.events}
                  {seat}
                  legal={client.legal}
                  {onCommand}
                  errorCount={client.errorCount}
                  onCaughtUp={focusPhase}
                  onShown={(all) => (shownAllFor = all ? roundKey : null)}
                  onStepsShown={(shown) => (stepsShown = { round: roundKey, shown })}
                  startAt={reportedShown}
                  onTight={(tight) => (showdownTight = tight)}
                />
              {/key}
            {/if}
          {/key}
        {/if}
      </div>

      {#if view !== null && seat !== null}
        <MyArea
          localiser={l}
          name={l.t(`seat-${seat}`)}
          {view}
          {seat}
          markers={markers?.[index(seat)]}
          animate
        />
      {/if}
    {/if}
  </Screen>
</div>

<style>
  .frame {
    display: contents;
  }

  .middle {
    display: flex;
    flex: 1 0 auto;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
  }

  .alert {
    background: var(--surface);
    border: 1px solid var(--line);
    border-inline-start: 3px solid var(--warn);
    border-radius: 8px;
    flex: none;
    font-size: 0.8125rem;
    margin: 0;
    padding: 6px 9px;
  }
</style>
