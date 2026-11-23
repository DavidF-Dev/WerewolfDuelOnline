<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends HTMLButtonAttributes {
    variant?: 'primary' | 'secondary' | 'danger';
    children: Snippet;
  }

  let { variant = 'secondary', type = 'button', children, ...rest }: Props = $props();
</script>

<button {...rest} {type} class={['button', variant, rest.class]}>{@render children()}</button>

<style>
  .button {
    font-weight: 600;
    padding: 0.75rem 1.25rem;
  }

  .primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }

  .primary:hover:not(:disabled, [aria-disabled='true']) {
    background: color-mix(in srgb, var(--accent) 85%, var(--ink));
  }

  .danger {
    border-color: var(--danger);
    color: var(--danger);
  }
</style>
