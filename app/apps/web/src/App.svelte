<script lang="ts">
  import { tick } from 'svelte';
  import { provideAppBanner } from './banner.js';
  import UnofficialNotice from './components/UnofficialNotice.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import { route } from './router.js';
  import About from './screens/About.svelte';
  import CreateOnline from './screens/CreateOnline.svelte';
  import Home from './screens/Home.svelte';
  import History from './screens/History.svelte';
  import Host from './screens/Host.svelte';
  import HowToPlay from './screens/HowToPlay.svelte';
  import Join from './screens/Join.svelte';
  import JoinOnline from './screens/JoinOnline.svelte';
  import Rejoin from './screens/Rejoin.svelte';
  import Replay from './screens/Replay.svelte';
  import Rules from './screens/Rules.svelte';
  import Settings from './screens/Settings.svelte';
  import Stats from './screens/Stats.svelte';
  import Tutorial from './screens/Tutorial.svelte';
  import { activeLocaliser } from './settings/language.svelte.js';
  import { showScreenTop } from './shell.js';

  // A change of language re-renders every screen in place, so a game in progress carries on.
  const localiser = $derived(activeLocaliser());
  provideAppBanner(updateBanner);

  // Each distinct address gets a fresh screen, so screens read their address only once.
  const key = $derived(JSON.stringify($route));

  // The first screen keeps the focus and scroll position the browser gives it.
  let shown: string | undefined;
  $effect(() => {
    const now = key;
    if (shown !== undefined && shown !== now) void tick().then(showScreenTop);
    shown = now;
  });

  // Production builds leave the gallery out altogether.
  const loadGallery = import.meta.env.DEV ? () => import('./gallery/Gallery.svelte') : null;
</script>

{#snippet updateBanner()}
  <UpdateBanner {localiser} />
{/snippet}

{#if $route.name === 'gallery' && loadGallery !== null}
  {@const id = $route.id}
  {#key key}
    {#await loadGallery() then gallery}
      <gallery.default {localiser} {id} />
    {/await}
  {/key}
{:else}
  {#key key}
    {#if $route.name === 'local-host'}
      <Host {localiser} />
    {:else if $route.name === 'local-join'}
      <Join {localiser} code={$route.code} />
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
      <HowToPlay {localiser} />
    {:else if $route.name === 'tutorial'}
      <Tutorial {localiser} />
    {:else if $route.name === 'rules'}
      <Rules {localiser} section={$route.section} />
    {:else}
      <Home {localiser} />
    {/if}
  {/key}
  {#if $route.name !== 'home' && $route.name !== 'about'}
    <UnofficialNotice {localiser} placement="page" />
  {/if}
{/if}
