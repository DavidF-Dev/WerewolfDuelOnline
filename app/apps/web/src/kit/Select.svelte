<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLSelectAttributes } from 'svelte/elements';

  interface Props extends HTMLSelectAttributes {
    /** The `option` elements. */
    children: Snippet;
  }

  let { children, ...rest }: Props = $props();
</script>

<span class="select">
  <select {...rest}>{@render children()}</select>
  <span class="arrow" aria-hidden="true">▾</span>
</span>

<style>
  .select {
    align-items: center;
    display: inline-grid;
    isolation: isolate;
    position: relative;
  }

  .select::before {
    background: var(--surface);
    border: 1px solid var(--control-line);
    border-radius: 8px;
    content: '';
    inset: 10px 0;
    position: absolute;
    transition:
      background-color var(--motion-fast) ease-out,
      border-color var(--motion-fast) ease-out;
    z-index: -1;
  }

  @media (hover: hover) and (pointer: fine) {
    .select:has(select:hover:not(:disabled))::before {
      background: var(--hover-bg);
      border-color: var(--hover-line);
    }
  }

  .select:has(select:focus-visible)::before {
    outline: var(--focus-width) solid var(--focus);
    outline-offset: 2px;
  }

  select {
    appearance: none;
    background: transparent;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.75rem;
    grid-area: 1 / 1;
    min-height: var(--target);
    min-width: 132px;
    padding: 0 28px 0 10px;
  }

  select:focus-visible {
    outline: none;
  }

  select:disabled {
    cursor: not-allowed;
  }

  /* Mobile browsers zoom the page into a focused field drawn under 16 px. */
  @media (pointer: coarse) {
    select {
      font-size: max(16px, 0.75rem);
    }
  }

  .select :global(option) {
    background: var(--surface);
    color: var(--ink);
  }

  .arrow {
    font-size: 0.75rem;
    grid-area: 1 / 1;
    justify-self: end;
    padding-inline-end: 10px;
    pointer-events: none;
  }
</style>
