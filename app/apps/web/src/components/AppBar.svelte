<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    /** The id for the heading, so a region can be labelled by it. */
    headingId: string;
    actions?: Snippet;
    /** The accessible name of a back button; without it there is no back button. */
    backLabel?: string;
    onback?: () => void;
  }

  let { title, headingId, actions, backLabel, onback }: Props = $props();
</script>

<header class="app-bar">
  {#if backLabel !== undefined}
    <button type="button" class="back" aria-label={backLabel} onclick={onback}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M15 5 8 12l7 7"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  {/if}
  <h1 id={headingId}>
    <svg class="emblem" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="var(--moon)" />
      <circle cx="16" cy="9" r="8" fill="var(--bar-a)" opacity="0.55" />
      <path d="M5 20l2.5-6 1.5 2 1-4 1.5 3 1.5-3 1 4 1.5-2L19 20z" fill="var(--bar-a)" />
    </svg>
    {title}
  </h1>
  {#if actions}
    <div class="actions">{@render actions()}</div>
  {/if}
</header>

<style>
  .app-bar {
    --focus: var(--bar-ink);
    align-items: center;
    background: linear-gradient(160deg, var(--bar-a), var(--bar-b));
    color: var(--bar-ink);
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    padding: 0.5rem 1rem;
  }

  h1 {
    align-items: center;
    display: flex;
    font-size: 1.25rem;
    gap: 0.5rem;
    letter-spacing: 0.02em;
    margin: 0;
  }

  .emblem {
    flex: none;
    height: 1.75rem;
    width: 1.75rem;
  }

  .back {
    align-items: center;
    background: none;
    border-color: var(--bar-ink);
    color: var(--bar-ink);
    display: flex;
    justify-content: center;
    padding: 0;
  }

  .back:hover:not(:disabled) {
    background: none;
  }

  .back svg {
    height: 1.5rem;
    width: 1.5rem;
  }

  .actions {
    display: flex;
    margin-inline-start: auto;
    gap: 0.5rem;
  }
</style>
