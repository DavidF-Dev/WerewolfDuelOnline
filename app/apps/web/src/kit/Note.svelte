<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLParagraphElement> {
    children: Snippet;
  }

  let { children, ...rest }: Props = $props();
</script>

<p {...rest} class={['kit-note', rest.class]}>{@render children()}</p>

<style>
  .kit-note {
    border-inline-start: 3px solid var(--warn);
    color: var(--muted);
    font-size: 0.71875rem;
    margin: 0;
    padding-inline-start: 6px;
  }
</style>
