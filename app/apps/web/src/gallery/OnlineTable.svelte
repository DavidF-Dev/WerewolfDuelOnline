<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { ConnectionState, GameClientState, Localiser } from '@wwd/client-core';
  import ConnectionBanner from '../components/ConnectionBanner.svelte';
  import ContinueElsewhere from '../components/ContinueElsewhere.svelte';
  import RejoinRequest from '../components/RejoinRequest.svelte';
  import { DEFAULT_SERVER } from '../online.js';
  import Table from '../screens/Table.svelte';

  /** The online table as the join screen composes it, with every action doing nothing. */
  interface Props {
    localiser: Localiser;
    state: GameClientState;
    connection: ConnectionState;
    /** Shown first, then replaced by `state` once mounted, as when a message arrives during play. */
    from?: GameClientState;
  }

  let { localiser: l, state: target, connection, from }: Props = $props();
  let shown = $state.raw<GameClientState>(untrack(() => from ?? target));
  onMount(() => {
    shown = target;
  });
  const ignore = (): void => {};
</script>

<Table
  localiser={l}
  state={shown}
  onCommand={ignore}
  mode="online"
  onResign={ignore}
  onPause={ignore}
  pauseActions={{ accept: ignore, cancel: ignore, resume: ignore }}
  onRematch={ignore}
  onViewReplay={ignore}
>
  {#snippet menu()}
    {#if shown.seat !== null}
      <ContinueElsewhere
        localiser={l}
        room={shown.room}
        seat={shown.seat}
        server={DEFAULT_SERVER}
        pin={shown.pin}
      />
    {/if}
  {/snippet}
  {#snippet banner()}
    <ConnectionBanner
      localiser={l}
      {connection}
      opponent={shown.opponent}
      lastError={shown.lastError}
      onClaimWin={ignore}
    />
  {/snippet}
  <RejoinRequest
    localiser={l}
    requested={shown.rejoinRequested}
    deadline={shown.rejoinDeadline}
    opponent={shown.opponent}
    onAnswer={ignore}
  />
</Table>
