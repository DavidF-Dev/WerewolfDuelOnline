<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import { provideAppBanner } from '../banner.js';
  import UnofficialNotice from '../components/UnofficialNotice.svelte';
  import UpdateBanner from '../components/UpdateBanner.svelte';
  import { setDeviceStore } from '../device-store.js';
  import { initSessions, resetSessions } from '../session.js';
  import { applySettings } from '../settings/apply.js';
  import { DEFAULT_SETTINGS } from '../settings/settings.js';
  import { memoryDeviceStore } from '../storage/db.js';
  import { GALLERY } from './entries.js';
  import { holdStill, useLongNames } from './fixtures.js';
  import { provideStaging } from './stage.js';

  interface Props {
    localiser: Localiser;
    /** The entry to show, or null for the list of entries. */
    id: string | null;
  }

  let { localiser: l, id }: Props = $props();
  provideAppBanner(updateBanner);
  const uid = $props.id();

  const entry = untrack(() => GALLERY.find((e) => e.id === id));
  const root = document.documentElement;
  let prepared = $state(false);
  let showNotice = $state(false);
  const work: Array<Promise<void>> = [];

  provideStaging((run) => work.push(run()));

  /** Starts each entry from the same fresh device: in-memory storage and the default settings. */
  async function prepare(): Promise<void> {
    // `?names=long` after the entry's id gives every player a 24-character name.
    const query = location.hash.split('?')[1] ?? '';
    useLongNames(new URLSearchParams(query).get('names') === 'long');
    // Reported as persistent, as most devices store data, so the screens show no in-memory note.
    const store = { ...memoryDeviceStore(), persistent: true };
    setDeviceStore(store);
    resetSessions();
    await initSessions(store);
    applySettings(DEFAULT_SETTINGS, root);
  }

  /** Two animation frames, by when the screen has drawn what it loaded. */
  const frames = (): Promise<void> =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  /** Waits for the transitions and animations that end, such as a chosen card rising. */
  async function settled(): Promise<void> {
    const ending = (document.getAnimations?.() ?? []).filter(
      (animation) => animation.effect?.getComputedTiming().endTime !== Infinity,
    );
    await Promise.all(ending.map((animation) => animation.finished.catch(() => undefined)));
  }

  onMount(() => {
    delete root.dataset['galleryReady'];
    delete root.dataset['galleryError'];
    if (entry === undefined) return;
    const shown = entry.id;
    const release = holdStill();
    void (async () => {
      try {
        await prepare();
        prepared = true;
        await tick();
        await Promise.all(work);
        await frames();
        // A screen that does not show the unofficial notice itself gets it below.
        showNotice = document.querySelector('[data-testid="unofficial-notice"]') === null;
        await tick();
        await frames();
        await settled();
        root.dataset['galleryReady'] = shown;
      } catch (error) {
        root.dataset['galleryError'] = shown;
        console.error(error);
      }
    })();
    return () => {
      release();
      delete root.dataset['galleryReady'];
      delete root.dataset['galleryError'];
    };
  });
</script>

{#snippet updateBanner()}
  <UpdateBanner localiser={l} />
{/snippet}

{#if entry === undefined}
  <main aria-labelledby="{uid}-heading">
    <h1 id="{uid}-heading">Gallery</h1>
    {#if id !== null}
      <p role="alert">There is no gallery entry called {id}.</p>
    {/if}
    <ul>
      {#each GALLERY as item (item.id)}
        <li data-entry={item.id} data-mockup={item.mockup} data-game={item.game}>
          <a href="#/dev/gallery/{item.id}">{item.title}</a>
          {#if item.mockup !== undefined}(mockup {item.mockup}){/if}
        </li>
      {/each}
    </ul>
  </main>
{:else if prepared}
  {@const Entry = entry.render}
  <Entry localiser={l} {...entry.props} />
  {#if showNotice}
    <UnofficialNotice localiser={l} placement="page" />
  {/if}
{/if}
