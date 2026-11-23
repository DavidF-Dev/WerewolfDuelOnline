<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Command } from '@wwd/engine';
  import type { ConnectionState, GameClientState, Localiser } from '@wwd/client-core';
  import ConnectionBanner from '../components/ConnectionBanner.svelte';
  import ContinueElsewhere from '../components/ContinueElsewhere.svelte';
  import InvitePanel from '../components/InvitePanel.svelte';
  import RejoinRequest from '../components/RejoinRequest.svelte';
  import ResignButton from '../components/ResignButton.svelte';
  import ServerConfirm from '../components/ServerConfirm.svelte';
  import { EXAMPLE_CODE, normaliseCode } from '../code.js';
  import { installDevHook } from '../dev-hook.js';
  import {
    DEFAULT_SERVER,
    joinHash,
    parseServer,
    rejoinHash,
    serverHost,
    startOnlineGame,
    type OnlineGame,
  } from '../online.js';
  import { hrefFor } from '../router.js';
  import { clearOnlineSession, loadOnlineSession, saveOnlineSession } from '../session.js';
  import Table from './Table.svelte';

  interface Props {
    localiser: Localiser;
    /** The join code from the address, as written. */
    code?: string;
    /** The referee URL from an invite link, as written. */
    server?: string;
  }

  let { localiser: l, ...address }: Props = $props();
  const uid = $props.id();

  // The address is fixed for this screen: a new address mounts a new one.
  const { code, server: linkedServer } = untrack(() => ({ ...address }));
  const room = code === undefined ? undefined : normaliseCode(code);
  const linked = linkedServer === undefined ? undefined : parseServer(linkedServer);
  const serverInvalid = linkedServer !== undefined && linked === undefined;
  const server = linked ?? DEFAULT_SERVER;
  const stored = room === undefined ? undefined : loadOnlineSession(server, room);
  const seatToken = stored?.seatToken;

  let game: OnlineGame | null = null;
  let stopGame: (() => void) | null = null;
  let snapshot = $state.raw<GameClientState | null>(null);
  let connection = $state.raw<ConnectionState | null>(null);
  let notice = $state<string | null>(null);
  let typed = $state(code ?? '');
  let invalid = $state(code !== undefined && room === undefined);
  // Nothing is sent to a server other than the default until the player agrees.
  let trusted = $state(server === DEFAULT_SERVER);

  function remember(state: GameClientState): void {
    if (room === undefined) return;
    if (state.status === 'rejected' && state.seatToken === null) {
      clearOnlineSession(server, room);
    } else if (state.seatToken !== null) {
      saveOnlineSession({ room, seatToken: state.seatToken, server, lastSeq: state.lastSeq });
    }
  }

  onMount(() => {
    if (trusted) begin();
    return () => {
      stopGame?.();
      stopGame = null;
    };
  });

  function trust(): void {
    trusted = true;
    begin();
  }

  function begin(): void {
    if (room === undefined || serverInvalid || game !== null) return;
    const started = startOnlineGame({
      server,
      room,
      ...(seatToken === undefined ? {} : { seatToken }),
    });
    game = started;
    let saved = '';
    const cleanups = [
      started.client.state.subscribe((state) => {
        // Saving only on a change keeps storage writes to one per new event or seat.
        const key = `${state.status}|${state.seatToken}|${state.lastSeq}`;
        if (key !== saved) {
          saved = key;
          remember(state);
        }
        snapshot = state;
        notice = null;
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
    if (typedRoom !== undefined) location.hash = joinHash(typedRoom, linked ?? DEFAULT_SERVER);
  }

  /** Runs `action` on the client, noting a problem when it cannot be sent. */
  function attempt(action: (game: OnlineGame) => void): void {
    if (game === null) return;
    try {
      action(game);
    } catch {
      notice =
        connection?.phase === 'online' ? 'problem-command-not-sent' : 'problem-not-connected';
    }
  }

  const command = (cmd: Command): void => attempt((g) => g.client.command(cmd));

  function joinAsNew(): void {
    if (room !== undefined) clearOnlineSession(server, room);
    attempt((g) => g.joinAsNew());
  }
</script>

{#snippet serverWarning()}
  {#if server !== DEFAULT_SERVER}
    <p data-testid="server-warning">{l.t('online-server-other', { host: serverHost(server) })}</p>
  {/if}
{/snippet}

{#snippet banner(state: GameClientState, conn: ConnectionState)}
  <ConnectionBanner
    localiser={l}
    connection={conn}
    opponent={state.opponent}
    lastError={state.lastError}
    onClaimWin={() => attempt((g) => g.client.claimWin())}
  />
{/snippet}

{#snippet continueElsewhere(state: GameClientState)}
  {#if room !== undefined && state.seat !== null}
    <ContinueElsewhere localiser={l} {room} seat={state.seat} {server} pin={state.pin} />
  {/if}
{/snippet}

{#if snapshot !== null && connection !== null && snapshot.view !== null}
  {@const state = snapshot}
  {@const conn = connection}
  <Table localiser={l} {state} onCommand={command} {notice} mode="online">
    {@render serverWarning()}
    {@render banner(state, conn)}
    <RejoinRequest
      localiser={l}
      requested={state.rejoinRequested}
      deadline={state.rejoinDeadline}
      opponent={state.opponent}
      onAnswer={(approve) => attempt((g) => g.client.approveRejoin(approve))}
    />
    {#if state.status === 'playing'}
      <ResignButton localiser={l} onResign={() => attempt((g) => g.client.resign())} />
    {/if}
    {@render continueElsewhere(state)}
  </Table>
{:else}
  <main aria-labelledby="{uid}-heading" data-testid="join-online">
    <h1 id="{uid}-heading">{l.t('online-join-heading')}</h1>
    {#if serverInvalid}
      <p role="alert" data-testid="server-invalid">{l.t('online-server-invalid')}</p>
    {:else if room !== undefined && !trusted}
      <ServerConfirm localiser={l} {server} onContinue={trust} />
    {:else if room === undefined}
      {@render serverWarning()}
      <form onsubmit={submit} novalidate>
        <label for="{uid}-code">{l.t('join-code-label')}</label>
        <input
          id="{uid}-code"
          name="code"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          aria-invalid={invalid}
          aria-describedby={invalid ? `${uid}-hint ${uid}-error` : `${uid}-hint`}
          data-testid="join-code-input"
          bind:value={typed}
        />
        <p id="{uid}-hint">{l.t('join-code-hint', { example: EXAMPLE_CODE })}</p>
        {#if invalid}
          <p id="{uid}-error" role="alert">{l.t('online-join-code-invalid')}</p>
        {/if}
        <button type="submit" data-testid="join-submit">{l.t('join-submit')}</button>
      </form>
    {:else if snapshot !== null && connection !== null}
      {@const state = snapshot}
      {@render serverWarning()}
      {@render banner(state, connection)}
      {#if connection.stopReason === 'unknown_seat'}
        <ul>
          <li>
            <button type="button" data-testid="join-as-new" onclick={joinAsNew}
              >{l.t('online-join-new')}</button
            >
          </li>
          <li>
            <a href={rejoinHash(room, null, server)} data-testid="rejoin-with-pin"
              >{l.t('online-rejoin-pin')}</a
            >
          </li>
        </ul>
      {:else if connection.stopReason !== null}
        <p><a href={hrefFor('join')}>{l.t('online-join-other')}</a></p>
      {:else if state.status === 'waiting'}
        <InvitePanel localiser={l} {room} {server} />
      {/if}
      {@render continueElsewhere(state)}
    {/if}
    <p><a href={hrefFor('home')}>{l.t('back-home')}</a></p>
  </main>
{/if}
