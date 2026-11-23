<script lang="ts">
  import { onMount } from 'svelte';
  import type { Command } from '@wwd/engine';
  import { GameClient, type GameClientState, type Localiser } from '@wwd/client-core';
  import { BroadcastChannelTransport } from '@wwd/transport';
  import { EXAMPLE_CODE, normaliseCode } from '../code.js';
  import { installDevHook } from '../dev-hook.js';
  import { loadEngine } from '../engine.js';
  import { channelFor, isHosted, watchHost } from '../local-room.js';
  import { hrefFor } from '../router.js';
  import { clearSession, loadSession, saveSession } from '../session.js';
  import { rejectionText, statusText } from '../text.js';
  import Table from './Table.svelte';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();
  const uid = $props.id();

  let client: GameClient | null = null;
  let snapshot = $state.raw<GameClientState | null>(null);
  let notice = $state<string | null>(null);
  let typed = $state('');
  let invalid = $state(false);
  let rejection = $state<string | null>(null);
  let release: Array<() => void> = [];
  let mounted = true;

  function disconnect(): void {
    for (const cleanup of release.splice(0)) cleanup();
    client = null;
    snapshot = null;
  }

  function remember(state: GameClientState): void {
    if (state.status === 'rejected' || state.status === 'disconnected') {
      clearSession();
    } else if (state.seatToken !== null) {
      saveSession({ room: state.room, seatToken: state.seatToken, lastSeq: state.lastSeq });
    }
  }

  function connect(room: string, seatToken?: string): void {
    disconnect();
    const created = new GameClient(seatToken === undefined ? { room } : { room, seatToken });
    let stopWatching: (() => void) | undefined;
    // Unsubscribing before disposal keeps a deliberate close from clearing the stored session.
    release = [
      () => stopWatching?.(),
      created.state.subscribe((state) => {
        remember(state);
        // A seat proves the host page was open, so from then on its closing ends this game.
        stopWatching ??=
          state.seat === null ? undefined : watchHost(state.room, () => created.dispose());
        // Before the game starts a refusal sends the guest back to the form.
        if (state.status === 'rejected' && state.view === null) {
          rejection = rejectionText(l, state.lastError);
          queueMicrotask(disconnect);
          return;
        }
        snapshot = state;
        notice = null;
      }),
      installDevHook(created, l),
      () => created.dispose(),
    ];
    created.attach(new BroadcastChannelTransport(channelFor(room)));
    client = created;
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    const code = normaliseCode(typed);
    invalid = code === undefined;
    if (code === undefined) return;
    void open(code);
  }

  /** Connects to `room` if a tab in this browser hosts it, and otherwise says so. */
  async function open(room: string, seatToken?: string): Promise<void> {
    rejection = null;
    let hosted: boolean;
    try {
      [hosted] = await Promise.all([isHosted(room), loadEngine()]);
    } catch {
      if (mounted) rejection = l.t('app-load-failed');
      return;
    }
    if (!mounted) return;
    if (hosted) {
      connect(room, seatToken);
    } else {
      clearSession();
      rejection = rejectionText(l, 'unknown_room');
    }
  }

  function command(cmd: Command): void {
    try {
      client?.command(cmd);
    } catch {
      notice = 'problem-command-not-sent';
    }
  }

  function resign(): void {
    try {
      client?.resign();
    } catch {
      notice = 'problem-command-not-sent';
    }
  }

  function rematch(): void {
    try {
      client?.requestRematch();
    } catch {
      notice = 'problem-command-not-sent';
    }
  }

  onMount(() => {
    const session = loadSession();
    if (session !== undefined) void open(session.room, session.seatToken);
    // Closing the connection lets the host see this tab leave; the kept session rejoins on reload.
    window.addEventListener('pagehide', disconnect);
    return () => {
      window.removeEventListener('pagehide', disconnect);
      mounted = false;
      disconnect();
      clearSession();
    };
  });
</script>

{#if snapshot !== null && snapshot.view !== null}
  <Table
    localiser={l}
    state={snapshot}
    onCommand={command}
    onResign={resign}
    onRematch={rematch}
    {notice}
  />
{:else}
  <main aria-labelledby="{uid}-heading" data-testid="join">
    <h1 id="{uid}-heading">{l.t('join-heading')}</h1>
    {#if snapshot !== null}
      <p role="status" data-testid="join-status">{statusText(l, snapshot.status)}</p>
      {#if snapshot.status === 'disconnected'}
        <p role="alert">{l.t('status-disconnected-detail')}</p>
      {:else}
        <p>{l.t('join-connecting-hint')}</p>
      {/if}
    {:else}
      {#if rejection !== null}
        <p role="alert" data-testid="join-rejected">{rejection}</p>
      {/if}
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
          <p id="{uid}-error" role="alert">{l.t('join-code-invalid')}</p>
        {/if}
        <button type="submit" data-testid="join-submit">{l.t('join-submit')}</button>
      </form>
    {/if}
    <p><a href={hrefFor('home')}>{l.t('back-home')}</a></p>
  </main>
{/if}
