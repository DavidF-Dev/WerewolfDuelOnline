<script lang="ts">
  import { onMount } from 'svelte';
  import { EngineError, defaultRulesConfig, type Command } from '@wwd/engine';
  import { GameClient, type GameClientState, type Localiser } from '@wwd/client-core';
  import { BroadcastChannelHost, MemoryReferee } from '@wwd/referee-memory';
  import { createInMemoryPair } from '@wwd/transport';
  import { groupCode } from '../code.js';
  import { installDevHook } from '../dev-hook.js';
  import { loadEngine } from '../engine.js';
  import { channelFor, holdHostLock } from '../local-room.js';
  import { hrefFor } from '../router.js';
  import { statusText } from '../text.js';
  import Table from './Table.svelte';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();
  const uid = $props.id();

  let client: GameClient | null = null;
  let snapshot = $state.raw<GameClientState | null>(null);
  let notice = $state<string | null>(null);
  let failed = $state(false);
  /** In development builds, what went wrong when the game could not start. */
  let failure = $state<string | null>(null);

  const describeFailure = (thrown: unknown): string =>
    thrown instanceof EngineError ? thrown.id : thrown instanceof Error ? thrown.message : '';

  // The room lives only in this page: closing or reloading it ends the game for the guest.
  onMount(() => {
    let mounted = true;
    const cleanups: Array<() => void> = [];
    const shutDown = (): void => {
      for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    };

    function start(): void {
      const referee = new MemoryReferee();
      cleanups.push(() => referee.close());
      const room = referee.createRoom(defaultRulesConfig());
      cleanups.push(holdHostLock(room));
      const host = new BroadcastChannelHost(referee, channelFor(room));
      cleanups.push(() => host.close());
      const [clientEnd, serverEnd] = createInMemoryPair();
      referee.accept(serverEnd);
      const created = new GameClient({ room });
      cleanups.push(
        () => created.dispose(),
        installDevHook(created, l),
        created.state.subscribe((value) => {
          snapshot = value;
          notice = null;
        }),
      );
      created.attach(clientEnd);
      client = created;
    }

    loadEngine()
      .then(() => {
        if (mounted) start();
      })
      .catch((thrown: unknown) => {
        // Nothing half-built may linger: the lock and the room go with the failure.
        shutDown();
        client = null;
        console.error(thrown);
        if (import.meta.env.DEV) failure = describeFailure(thrown);
        failed = true;
      });
    window.addEventListener('pagehide', shutDown);
    return () => {
      mounted = false;
      window.removeEventListener('pagehide', shutDown);
      shutDown();
    };
  });

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
  <main aria-labelledby="{uid}-heading" data-testid="host">
    <h1 id="{uid}-heading">{l.t('host-heading')}</h1>
    {#if failed}
      <p role="alert" data-testid="host-failed">
        {l.t('host-failed')}
        {#if failure}<code data-testid="host-failure">{failure}</code>{/if}
      </p>
    {:else if snapshot === null}
      <p role="status">{l.t('host-starting')}</p>
    {:else}
      <h2 id="{uid}-code">{l.t('host-code-label')}</h2>
      <p class="code" data-testid="join-code">
        {groupCode(snapshot.room)}
      </p>
      <p>{l.t('host-instructions')}</p>
      <p role="status" data-testid="host-status">{statusText(l, snapshot.status)}</p>
    {/if}
    <p><a href={hrefFor('home')}>{l.t('back-home')}</a></p>
  </main>
{/if}
