<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { fitText } from '../components/fit-text.js';

  interface Props extends HTMLAttributes<HTMLSpanElement> {
    /** Decoration shown before the text. */
    icon?: Snippet;
    /** Keeps the text on one line, shrinking it to fit the chip's room. */
    fit?: boolean;
    children: Snippet;
  }

  let { icon, fit = false, children, ...rest }: Props = $props();
</script>

<span {...rest} class={['chip', { fit }, rest.class]}
  >{@render icon?.()}{#if fit}<span data-part="label" use:fitText>{@render children()}</span
    >{:else}{@render children()}{/if}</span
>

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
    /* A length, so text shrunk to fit keeps the chip's height. */
    line-height: 0.975rem;
    padding: 3px 7px;
  }

  .fit {
    box-sizing: border-box;
    max-width: 100%;
    min-width: 0;
  }
</style>
