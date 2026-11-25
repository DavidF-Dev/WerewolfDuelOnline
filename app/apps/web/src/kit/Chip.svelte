<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLSpanElement> {
    /** Decoration shown before the text. */
    icon?: Snippet;
    children: Snippet;
  }

  let { icon, children, ...rest }: Props = $props();
</script>

<span {...rest} class={['chip', rest.class]}>{@render icon?.()}{@render children()}</span>

<style>
  .chip {
    align-items: center;
    background: var(--chip);
    border-radius: 999px;
    color: var(--ink);
    display: inline-flex;
    font-size: 0.75rem;
    font-weight: 600;
    gap: 4px;
    line-height: 1.3;
    padding: 3px 7px;
  }
</style>
