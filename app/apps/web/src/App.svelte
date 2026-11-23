<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import { route } from './router.js';
  import CreateOnline from './screens/CreateOnline.svelte';
  import Home from './screens/Home.svelte';
  import Host from './screens/Host.svelte';
  import Join from './screens/Join.svelte';
  import JoinOnline from './screens/JoinOnline.svelte';
  import Rejoin from './screens/Rejoin.svelte';

  interface Props {
    localiser: Localiser;
  }

  let { localiser }: Props = $props();

  // Each distinct address gets a fresh screen, so screens read their address only once.
  const key = $derived(JSON.stringify($route));
</script>

{#key key}
  {#if $route.name === 'local-host'}
    <Host {localiser} />
  {:else if $route.name === 'local-join'}
    <Join {localiser} />
  {:else if $route.name === 'online-new'}
    <CreateOnline {localiser} />
  {:else if $route.name === 'join'}
    <JoinOnline {localiser} code={$route.code} server={$route.server} />
  {:else if $route.name === 'rejoin'}
    <Rejoin {localiser} code={$route.code} seat={$route.seat} server={$route.server} />
  {:else}
    <Home {localiser} />
  {/if}
{/key}
<p data-testid="unofficial-notice">{localiser.t('footer-unofficial')}</p>
