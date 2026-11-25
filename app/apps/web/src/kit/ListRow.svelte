<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLElement> {
    /** `li` inside a list; `div` otherwise. */
    as?: 'li' | 'div';
    /** What sits at the end of the row, such as its action. */
    end?: Snippet;
    children: Snippet;
  }

  let { as = 'li', end, children, ...rest }: Props = $props();
</script>

<svelte:element this={as} {...rest} class={['list-row', rest.class]}>
  <div class="main">{@render children()}</div>
  {#if end}<div class="end">{@render end()}</div>{/if}
</svelte:element>

<style>
  .list-row {
    align-items: center;
    border-bottom: 1px solid var(--line);
    display: flex;
    gap: 8px;
    justify-content: space-between;
    margin: 0;
    padding: 8px 0;
  }

  .list-row:last-child {
    border-bottom: 0;
  }

  .main {
    min-width: 0;
  }

  .end {
    flex: none;
  }
</style>
