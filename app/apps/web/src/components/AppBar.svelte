<script lang="ts">
  import type { Snippet } from 'svelte';
  import IconButton from '../kit/IconButton.svelte';
  import { trimToCaps } from './trim-to-caps.js';

  interface Props {
    title: string;
    /** Draws the title as the app's name, in the display face. */
    brand?: boolean;
    /** The id for the heading, so a region can be labelled by it. */
    headingId: string;
    /** The accessible name of a back button, shown on the left; without it there is none. */
    back?: string;
    onback?: () => void;
    /** What sits before the title when there is no back button, such as a menu button. */
    left?: Snippet;
    /** What sits after the title, such as a settings or log button. */
    right?: Snippet;
  }

  let { title, brand = false, headingId, back, onback, left, right }: Props = $props();
  const hasLeft = $derived(back !== undefined || left !== undefined);
</script>

<header class="app-bar">
  {#if back !== undefined}
    <IconButton icon="back" label={back} onclick={onback} />
  {:else if left}
    {@render left()}
  {/if}
  <h1 id={headingId} tabindex="-1">
    <svg class="emblem" data-part="emblem" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" fill="var(--moon)" />
      <circle cx="16" cy="9" r="8" fill="var(--bar-a)" opacity="0.55" />
      <path d="M5 20l2.5-6 1.5 2 1-4 1.5 3 1.5-3 1 4 1.5-2L19 20z" fill="var(--bar-a)" />
    </svg>
    <span class={['title', { brand }]} data-part="bar-title" use:trimToCaps>{title}</span>
  </h1>
  {#if right}
    <div class="right">{@render right()}</div>
  {:else if hasLeft}
    <span class="balance" aria-hidden="true"></span>
  {/if}
</header>

<style>
  .app-bar {
    --focus: var(--bar-ink);
    align-items: center;
    background: linear-gradient(160deg, var(--bar-a), var(--bar-b));
    color: var(--bar-ink);
    display: flex;
    gap: 8px;
    justify-content: space-between;
    min-height: 52px;
    padding: 10px 12px;
  }

  h1 {
    align-items: center;
    display: flex;
    font-size: 0.9375rem;
    gap: 7px;
    letter-spacing: 0.02em;
    line-height: 1;
    margin: 0;
    min-width: 0;
  }

  h1:focus:not(:focus-visible) {
    outline: none;
  }

  /* The title's box is trimmed to its capitals' top and its baseline, so centring it centres the drawn letters. */
  .title {
    display: block;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .brand {
    font-family: var(--font-display);
  }

  @supports (text-box: trim-both cap alphabetic) {
    .title {
      text-box: trim-both cap alphabetic;
    }
  }

  .emblem {
    flex: none;
    height: 22px;
    width: 22px;
  }

  .right {
    display: flex;
    flex: none;
    gap: 8px;
  }

  .balance {
    flex: none;
    width: 0;
  }
</style>
