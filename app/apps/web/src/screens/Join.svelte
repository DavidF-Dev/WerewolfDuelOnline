<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Command } from '@wwd/engine';
  import { GameClient, type GameClientState, type Localiser } from '@wwd/client-core';
  import { BroadcastChannelTransport } from '@wwd/transport';
  import { normaliseCode } from '../code.js';
  import { installDevHook } from '../dev-hook.js';
  import { loadEngine } from '../engine.js';
  import { channelFor, isHosted, watchHost } from '../local-room.js';
  import { DEFAULT_SERVER, joinHash } from '../online.js';
  import type { Place } from '../place.js';
  import { clearSession, loadSession, saveSession } from '../session.js';
  import { rejectionText, statusText } from '../text.js';
  import Button from '../components/Button.svelte';
  import PlaceChoice from '../components/PlaceChoice.svelte';
  import CodeField from '../components/CodeField.svelte';
  import Screen from '../components/Screen.svelte';
  import WaitingStatus, { waitStateOf } from '../components/WaitingStatus.svelte';
  import Note from '../kit/Note.svelte';
  import Panel from '../kit/Panel.svelte';
  import Table from './Table.svelte';

  interface Props {
    localiser: Localiser;
    /** A join code from the address, as written, to join at once. */
    code?: string;
  }

  let { localiser: l, code: linked }: Props = $props();

  let client: GameClient | null = null;
  let snapshot = $state.raw<GameClientState | null>(null);
  let notice = $state<string | null>(null);
  // The address is fixed for this screen: a new address mounts a new one.
  const linkedCode = untrack(() => linked);
  let typed = $state(linkedCode ?? '');
  let invalid = $state(false);
  let place = $state<Place>('device');
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
    if (place === 'online') location.hash = joinHash(code, DEFAULT_SERVER);
    else void open(code);
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
    const linkedRoom = linkedCode === undefined ? undefined : normaliseCode(linkedCode);
    // A kept seat in another room gives way to the code in the address.
    if (session !== undefined && (linkedCode === undefined || session.room === linkedRoom)) {
      void open(session.room, session.seatToken);
    } else if (linkedCode !== undefined) {
      invalid = linkedRoom === undefined;
      if (linkedRoom !== undefined) void open(linkedRoom);
    }
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
  <Screen title={l.t('join-heading')} testId="join" back={l.t('back')}>
    {#if snapshot !== null}
      <WaitingStatus
        text={statusText(l, snapshot.status)}
        state={waitStateOf(snapshot.status)}
        testId="join-status"
      />
      {#if snapshot.status === 'disconnected'}
        <p role="alert">{l.t('status-disconnected-detail')}</p>
      {:else}
        <Note>{l.t('join-connecting-hint')}</Note>
      {/if}
    {:else}
      {#if rejection !== null}
        <p role="alert" data-testid="join-rejected">{rejection}</p>
      {/if}
      <form class="join-form" onsubmit={submit} novalidate>
        <Panel class="join-panel">
          <PlaceChoice localiser={l} purpose="join" bind:value={place} />
          <CodeField
            localiser={l}
            bind:value={typed}
            {invalid}
            error={l.t('join-code-invalid')}
            testId="join-code-input"
          />
          <Button type="submit" variant="primary" data-testid="join-submit"
            >{l.t('join-submit')}</Button
          >
        </Panel>
      </form>
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
