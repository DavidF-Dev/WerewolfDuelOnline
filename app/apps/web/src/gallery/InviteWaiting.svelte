<script lang="ts">
  import type { ConnectionState, GameClientState, Localiser } from '@wwd/client-core';
  import ConnectionBanner from '../components/ConnectionBanner.svelte';
  import InvitePanel from '../components/InvitePanel.svelte';
  import Screen from '../components/Screen.svelte';
  import { DEFAULT_SERVER } from '../online.js';

  /** The join screen as it waits for the opponent, composed as that screen composes it. */
  interface Props {
    localiser: Localiser;
    state: GameClientState;
    connection: ConnectionState;
  }

  let { localiser: l, state, connection }: Props = $props();
</script>

<Screen title={l.t('invite-title')} testId="join-online" back={l.t('back')}>
  {#snippet banner()}
    <ConnectionBanner
      localiser={l}
      {connection}
      opponent={state.opponent}
      lastError={state.lastError}
      onClaimWin={() => {}}
    />
  {/snippet}
  <InvitePanel
    localiser={l}
    room={state.room}
    server={DEFAULT_SERVER}
    titled={false}
    config={state.config}
    seat={state.seat}
    opponentJoined={state.opponent.connected}
  />
</Screen>
