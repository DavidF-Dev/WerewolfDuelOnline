<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Command, Seat } from '@wwd/engine';
  import type { ConnectionState, GameClientState, Localiser } from '@wwd/client-core';
  import ConnectionBanner from '../components/ConnectionBanner.svelte';
  import ContinueElsewhere from '../components/ContinueElsewhere.svelte';
  import DisplayNamePrompt from '../components/DisplayNamePrompt.svelte';
  import InvitePanel from '../components/InvitePanel.svelte';
  import RejoinRequest from '../components/RejoinRequest.svelte';
  import ServerConfirm from '../components/ServerConfirm.svelte';
  import { normaliseCode } from '../code.js';
  import { getDeviceStore, rememberDisplayName } from '../device-store.js';
  import { installDevHook } from '../dev-hook.js';
  import {
    DEFAULT_SERVER,
    createProblemId,
    joinHash,
    parseServer,
    rejoinHash,
    serverHost,
    startOnlineGame,
    type OnlineGame,
  } from '../online.js';
  import { hrefFor, localJoinHash, replayHref } from '../router.js';
  import { createRoomFromSave, historyId, historyRecordFor, recordFinishedGame } from '../saves.js';
  import {
    clearOnlineSession,
    confirmOnlineSession,
    forgetResumedInto,
    loadOnlineSave,
    markResumedAs,
    unmarkResumedAs,
    loadOnlineSession,
    saveOnlineSession,
    setOnlineSessionSave,
  } from '../session.js';
  import Button from '../components/Button.svelte';
  import PlaceChoice from '../components/PlaceChoice.svelte';
  import CodeField from '../components/CodeField.svelte';
  import Screen from '../components/Screen.svelte';
  import Note from '../kit/Note.svelte';
  import Panel from '../kit/Panel.svelte';
  import Spinner from '../kit/Spinner.svelte';
  import type { Place } from '../place.js';
  import Table from './Table.svelte';

  interface Props {
    localiser: Localiser;
    /** The join code from the address, as written. */
    code?: string;
    /** The referee URL from an invite link, as written. */
    server?: string;
    /** The seat to claim in a room created from this device's save. */
    seat?: Seat;
  }

  let { localiser: l, ...address }: Props = $props();

  // The address is fixed for this screen: a new address mounts a new one.
  const { code, server: linkedServer, seat: askedSeat } = untrack(() => ({ ...address }));
  const room = code === undefined ? undefined : normaliseCode(code);
  const linked = linkedServer === undefined ? undefined : parseServer(linkedServer);
  const serverInvalid = linkedServer !== undefined && linked === undefined;
  const server = linked ?? DEFAULT_SERVER;
  const stored = room === undefined ? undefined : loadOnlineSession(server, room);
  let seatToken = stored?.seatToken;
  // Set once the stored seat has been checked against removals made in other tabs.
  let checked = false;

  let game: OnlineGame | null = null;
  let stopGame: (() => void) | null = null;
  let snapshot = $state.raw<GameClientState | null>(null);
  let connection = $state.raw<ConnectionState | null>(null);
  let notice = $state<string | null>(null);
  let typed = $state(code ?? '');
  let place = $state<Place>('online');
  let invalid = $state(code !== undefined && room === undefined);
  // Nothing is sent to a server other than the default until the player agrees.
  let trusted = $state(server === DEFAULT_SERVER);
  // A newcomer without a stored display name is asked for one before connecting.
  let nameNeeded = $state(false);
  let name: string | undefined;
  let typedName = $state('');
  // The save hash last written to this seat's session, and the one this screen's client holds.
  let storedSave = room === undefined ? null : (loadOnlineSave(server, room)?.save.hash ?? null);
  let liveSave: string | null = null;
  let recordedGame = -1;
  // Set once the opponent has been seen, after which an invite is no longer offered.
  let opponentSeen = $state(false);
  let resuming = $state(false);
  let resumeProblem = $state<string | null>(null);
  // Set once a stored seat whose save continues here may be forgotten.
  let handedOver = false;

  function remember(state: GameClientState): void {
    if (room === undefined) return;
    // A save that was to continue here is offered again from its own room.
    if (state.lastError === 'unknown_room' || state.lastError === 'room_closed') {
      unmarkResumedAs(server, room);
    }
    if (state.status === 'rejected' && state.seatToken === null) {
      clearOnlineSession(server, room);
    } else if (state.seatToken !== null) {
      const stored = saveOnlineSession({
        room,
        seatToken: state.seatToken,
        server,
        lastSeq: state.lastSeq,
        ...(state.seat === null ? {} : { seat: state.seat }),
        ...(state.opponent.name === undefined ? {} : { opponentName: state.opponent.name }),
        // The game index is known only once the referee's welcome has arrived.
        ...(state.config === null ? {} : { game: state.game }),
        ...(state.view === null
          ? {}
          : {
              round: state.view.round,
              yourTurn: state.seat !== null && (state.pending?.seats.includes(state.seat) ?? false),
            }),
        ...(state.status === 'game_over' ? { finished: true } : {}),
      });
      if (!handedOver) {
        handedOver = true;
        // The seat this room continues is forgotten only once this one is stored, so one always is.
        void stored.then((kept) => {
          if (kept) forgetResumedInto(server, room);
          else handedOver = false;
        });
      }
    }
    const hash = state.save?.hash ?? null;
    if (hash !== null && hash !== storedSave) {
      storedSave = hash;
      setOnlineSessionSave(server, room, state.save);
    } else if (hash === null && liveSave !== null) {
      // Only a resume this client saw clears the save; one that has heard nothing yet holds none.
      storedSave = null;
      setOnlineSessionSave(server, room, null);
    }
    liveSave = hash;
    const store = getDeviceStore();
    if (store !== undefined && state.status === 'game_over' && recordedGame !== state.game) {
      const record = historyRecordFor(historyId(server, room, state.game), state);
      if (record !== undefined) {
        recordedGame = state.game;
        void recordFinishedGame(store, record).then(
          () => {
            keptId = record.id;
          },
          () => {
            // Without storage the game is simply not kept in the history.
          },
        );
      }
    }
  }

  /** The history record kept for the finished game, once it is stored. */
  let keptId = $state<string | null>(null);

  /** The game's state and connection while the screen shows them: the server trusted, the room known and the name given. */
  const joined = $derived(
    !serverInvalid &&
      room !== undefined &&
      trusted &&
      !nameNeeded &&
      snapshot !== null &&
      connection !== null
      ? { state: snapshot, connection }
      : null,
  );

  /** Whether the screen shows the invite: this seat waits in the room for its opponent. */
  const inviting = $derived(
    trusted &&
      !nameNeeded &&
      connection !== null &&
      connection.stopReason === null &&
      snapshot?.status === 'waiting',
  );

  onMount(() => {
    void start();
    return () => {
      stopGame?.();
      stopGame = null;
    };
  });

  async function start(): Promise<void> {
    if (room !== undefined && seatToken !== undefined) {
      seatToken = (await confirmOnlineSession(server, room))?.seatToken;
      if (seatToken === undefined) storedSave = null;
    }
    checked = true;
    const store = getDeviceStore();
    if (store !== undefined && room !== undefined && seatToken === undefined) {
      try {
        name = (await store.identity.get()).displayName;
        nameNeeded = name === undefined;
      } catch {
        // The game is joined without a name.
      }
    }
    if (trusted && !nameNeeded) begin();
  }

  function trust(): void {
    trusted = true;
    if (!nameNeeded && checked) begin();
  }

  async function answerName(skip: boolean): Promise<void> {
    const trimmed = typedName.trim();
    if (!skip && trimmed !== '') {
      name = trimmed;
      await rememberDisplayName(trimmed);
    }
    nameNeeded = false;
    if (trusted) begin();
  }

  function begin(): void {
    if (room === undefined || serverInvalid || game !== null) return;
    const started = startOnlineGame({
      server,
      room,
      ...(name === undefined ? {} : { name }),
      ...(seatToken === undefined ? {} : { seatToken }),
      ...(askedSeat === undefined ? {} : { seat: askedSeat }),
    });
    game = started;
    let saved = '';
    const cleanups = [
      started.client.state.subscribe((state) => {
        // Saving only on a change keeps storage writes to one per new event, seat, pause, game, opponent name or problem.
        const key = `${state.lastError}|${state.status}|${state.seatToken}|${state.lastSeq}|${state.game}|${state.config === null}|${state.save?.hash}|${state.pause.paused}|${state.opponent.name}`;
        if (key !== saved) {
          saved = key;
          remember(state);
        }
        snapshot = state;
        notice = null;
        if (state.opponent.connected) opponentSeen = true;
      }),
      started.manager.state.subscribe((state) => (connection = state)),
      installDevHook(started.client, l, () => connection),
    ];
    stopGame = () => {
      for (const cleanup of cleanups.reverse()) cleanup();
      started.stop();
      game = null;
    };
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    const typedRoom = normaliseCode(typed);
    invalid = typedRoom === undefined;
    if (typedRoom === undefined) return;
    location.hash =
      place === 'device' ? localJoinHash(typedRoom) : joinHash(typedRoom, linked ?? DEFAULT_SERVER);
  }

  /** Runs `action` on the game; false, with a notice, when it could not be sent. */
  function attempt(action: (game: OnlineGame) => void): boolean {
    if (game === null) return false;
    try {
      action(game);
      return true;
    } catch {
      notice =
        connection?.phase === 'online' ? 'problem-command-not-sent' : 'problem-not-connected';
      return false;
    }
  }

  const command = (cmd: Command): void => {
    attempt((g) => g.client.command(cmd));
  };

  /** Continues this seat's saved game in a new room on the same server, then opens it. */
  async function resumeFromSave(): Promise<void> {
    const kept = room === undefined ? undefined : loadOnlineSave(server, room);
    if (kept === undefined || room === undefined || resuming) return;
    resuming = true;
    resumeProblem = null;
    const result = await createRoomFromSave(server, kept.save, kept.seat);
    resuming = false;
    if (!result.ok) {
      resumeProblem = createProblemId(result.problem, navigator.onLine);
      return;
    }
    await markResumedAs(server, room, result.code);
    location.hash = joinHash(result.code, server, kept.seat);
  }

  function joinAsNew(): void {
    if (room !== undefined) clearOnlineSession(server, room);
    attempt((g) => g.joinAsNew());
  }
</script>

{#snippet serverWarning()}
  {#if server !== DEFAULT_SERVER}
    <Note data-testid="server-warning"
      >{l.t('online-server-other', { host: serverHost(server) })}</Note
    >
  {/if}
{/snippet}

{#snippet connectionBanner(state: GameClientState, conn: ConnectionState)}
  <ConnectionBanner
    localiser={l}
    connection={conn}
    opponent={state.opponent}
    lastError={state.lastError}
    onClaimWin={() => attempt((g) => g.client.claimWin())}
  />
{/snippet}

{#snippet savedGame(state: GameClientState, conn: ConnectionState)}
  {#if room !== undefined && (conn.stopReason === 'unknown_room' || state.lastError === 'room_closed') && loadOnlineSave(server, room) !== undefined}
    <Panel title={l.t('save-resume')} data-testid="saved-game">
      <p>{l.t('save-room-gone')}</p>
      <Button
        variant="primary"
        data-testid="resume-from-save"
        aria-disabled={resuming}
        onclick={() => void resumeFromSave()}>{l.t('save-resume')}</Button
      >
      <p role="status">
        {#if resuming}{l.t('save-resuming')}<Spinner />{/if}
      </p>
      {#if resumeProblem !== null}
        <p role="alert" data-testid="resume-from-save-problem">{l.t(resumeProblem)}</p>
      {/if}
    </Panel>
  {/if}
{/snippet}

{#snippet waitingBanner()}
  {#if joined !== null}
    {@render connectionBanner(joined.state, joined.connection)}
  {/if}
{/snippet}

{#snippet continueElsewhere(state: GameClientState)}
  {#if room !== undefined && state.seat !== null}
    <ContinueElsewhere localiser={l} {room} seat={state.seat} {server} pin={state.pin} />
  {/if}
{/snippet}

{#if snapshot !== null && connection !== null && snapshot.view !== null}
  {@const state = snapshot}
  {@const conn = connection}
  <Table
    localiser={l}
    {state}
    onCommand={command}
    {notice}
    mode="online"
    onResign={() => attempt((g) => g.client.resign())}
    onPause={() => attempt((g) => g.client.requestPause())}
    pauseActions={{
      accept: () => attempt((g) => g.client.acceptPause()),
      cancel: () => attempt((g) => g.client.cancelPause()),
      resume: () => attempt((g) => g.client.requestResume()),
    }}
    onRematch={() => attempt((g) => g.client.requestRematch())}
    onViewReplay={keptId !== null && keptId === historyId(server, room ?? '', state.game)
      ? () => {
          location.hash = replayHref(keptId ?? '');
        }
      : undefined}
  >
    {#snippet paused()}
      {#if askedSeat !== undefined && room !== undefined && !opponentSeen}
        <InvitePanel localiser={l} {room} {server} resumed />
      {/if}
    {/snippet}
    {#snippet menu()}
      {@render continueElsewhere(state)}
    {/snippet}
    {#snippet banner()}
      {@render connectionBanner(state, conn)}
    {/snippet}
    {@render serverWarning()}
    {@render savedGame(state, conn)}
    <RejoinRequest
      localiser={l}
      requested={state.rejoinRequested}
      deadline={state.rejoinDeadline}
      opponent={state.opponent}
      onAnswer={(approve) => attempt((g) => g.client.approveRejoin(approve))}
    />
  </Table>
{:else}
  <Screen
    title={l.t(inviting ? 'invite-title' : 'online-join-heading')}
    testId="join-online"
    back={l.t('back')}
    banner={waitingBanner}
  >
    {#if serverInvalid}
      <p role="alert" data-testid="server-invalid">{l.t('online-server-invalid')}</p>
    {:else if room !== undefined && !trusted}
      <ServerConfirm localiser={l} {server} onContinue={trust} />
    {:else if room === undefined}
      {@render serverWarning()}
      <form class="join-form" onsubmit={submit} novalidate>
        <Panel class="join-panel">
          <PlaceChoice localiser={l} purpose="join" bind:value={place} />
          <CodeField
            localiser={l}
            bind:value={typed}
            {invalid}
            error={l.t('online-join-code-invalid')}
            testId="join-code-input"
          />
          <Button type="submit" variant="primary" data-testid="join-submit"
            >{l.t('join-submit')}</Button
          >
        </Panel>
      </form>
    {:else if nameNeeded}
      <DisplayNamePrompt
        localiser={l}
        bind:value={typedName}
        onanswer={(skip) => void answerName(skip)}
      />
    {:else if joined !== null}
      {@const { state, connection } = joined}
      {@render serverWarning()}
      {@render savedGame(state, connection)}
      {#if connection.stopReason === 'unknown_seat'}
        <Button variant="primary" data-testid="join-as-new" onclick={joinAsNew}
          >{l.t('online-join-new')}</Button
        >
        <Button href={rejoinHash(room, null, server)} data-testid="rejoin-with-pin"
          >{l.t('online-rejoin-pin')}</Button
        >
      {:else if connection.stopReason !== null}
        {#if connection.stopReason === 'room_full'}
          <Button
            variant="primary"
            data-testid="room-full-rejoin"
            onclick={() => {
              location.hash = rejoinHash(room, null, server);
            }}>{l.t('online-room-full-rejoin')}</Button
          >
        {/if}
        <Button href={hrefFor('join')}>{l.t('online-join-other')}</Button>
      {:else if state.status === 'waiting'}
        <InvitePanel
          localiser={l}
          {room}
          {server}
          titled={false}
          config={state.config}
          seat={state.seat}
          opponentJoined={state.opponent.connected}
        />
      {/if}
      {#if !inviting}
        {@render continueElsewhere(state)}
      {/if}
    {/if}
  </Screen>
{/if}

<style>
  .join-form :global(.join-panel) {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
</style>
