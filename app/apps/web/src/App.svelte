<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import { route } from './router.js';
  import About from './screens/About.svelte';
  import CharacterReference from './screens/CharacterReference.svelte';
  import CreateOnline from './screens/CreateOnline.svelte';
  import Home from './screens/Home.svelte';
  import History from './screens/History.svelte';
  import Host from './screens/Host.svelte';
  import Join from './screens/Join.svelte';
  import JoinOnline from './screens/JoinOnline.svelte';
  import Rejoin from './screens/Rejoin.svelte';
  import Replay from './screens/Replay.svelte';
  import Settings from './screens/Settings.svelte';
  import Stats from './screens/Stats.svelte';

  interface Props {
    localiser: Localiser;
  }

  let { localiser }: Props = $props();

  // Each distinct address gets a fresh screen, so screens read their address only once.
  const key = $derived(JSON.stringify($route));
</script>

<UpdateBanner {localiser} />
{#key key}
  {#if $route.name === 'local-host'}
    <Host {localiser} />
  {:else if $route.name === 'local-join'}
    <Join {localiser} />
  {:else if $route.name === 'online-new'}
    <CreateOnline {localiser} />
  {:else if $route.name === 'join'}
    <JoinOnline {localiser} code={$route.code} server={$route.server} seat={$route.seat} />
  {:else if $route.name === 'rejoin'}
    <Rejoin {localiser} code={$route.code} seat={$route.seat} server={$route.server} />
  {:else if $route.name === 'settings'}
    <Settings {localiser} />
  {:else if $route.name === 'about'}
    <About {localiser} />
  {:else if $route.name === 'history'}
    <History {localiser} />
  {:else if $route.name === 'replay'}
    <Replay {localiser} id={$route.id} />
  {:else if $route.name === 'stats'}
    <Stats {localiser} />
  {:else if $route.name === 'how-to-play'}
    <CharacterReference {localiser} />
  {:else}
    <Home {localiser} />
  {/if}
{/key}
{#if $route.name !== 'home' && $route.name !== 'about'}
  <p class="page-width" data-testid="unofficial-notice">{localiser.t('footer-unofficial')}</p>
{/if}
