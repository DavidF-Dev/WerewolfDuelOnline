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
  import { copyText } from '../clipboard.js';
  import { statusText } from '../text.js';
  import Button from '../components/Button.svelte';
  import Screen from '../components/Screen.svelte';
  import WaitingStatus, { waitStateOf } from '../components/WaitingStatus.svelte';
  import Label from '../kit/Label.svelte';
  import Note from '../kit/Note.svelte';
  import Panel from '../kit/Panel.svelte';
  import Table from './Table.svelte';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();
  let feedback = $state('');

  async function copy(room: string): Promise<void> {
    feedback = l.t((await copyText(room)) ? 'copy-done' : 'copy-failed');
  }

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
  <Screen title={l.t('host-heading')} testId="host" back={l.t('back')}>
    {#if failed}
      <p role="alert" data-testid="host-failed">
        {l.t('host-failed')}
        {#if failure}<code data-testid="host-failure">{failure}</code>{/if}
      </p>
    {:else if snapshot === null}
      <p role="status">{l.t('host-starting')}</p>
    {:else}
      {@const room = snapshot.room}
      <Panel>
        <div class="host-code">
          <Label as="h2">{l.t('host-code-label')}</Label>
          <p class="code" data-testid="join-code">{groupCode(room)}</p>
          <div class="buttons">
            <Button
              size="small"
              variant="primary"
              data-testid="copy-code"
              onclick={() => copy(room)}>{l.t('invite-copy-code')}</Button
            >
          </div>
          <p class="feedback" role="status">{feedback}</p>
        </div>
      </Panel>
      <Note>{l.t('host-instructions')}</Note>
      <WaitingStatus
        text={statusText(l, snapshot.status)}
        state={waitStateOf(snapshot.status)}
        testId="host-status"
      />
    {/if}
  </Screen>
{/if}

<style>
  .host-code {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: center;
  }

  .code {
    font-family: var(--font-mono);
    font-size: 1.875rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    line-height: 1;
    margin: 0;
  }

  .buttons {
    display: flex;
    justify-content: center;
  }

  .feedback {
    font-size: 0.75rem;
    margin: 0;
  }
</style>
