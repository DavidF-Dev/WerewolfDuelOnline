<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
  import Spinner from '../kit/Spinner.svelte';
  import { fitText } from './fit-text.js';
  import WarningIcon from './WarningIcon.svelte';

  interface Common {
    /** `block` fills the width; `small` sits inline. */
    size?: 'block' | 'small';
    /** Decoration shown before the label; danger buttons always show the warning icon instead. */
    icon?: Snippet;
    /** Keeps the label on one line, shrinking it to fit the button's room. */
    fit?: boolean;
    /** Shows a spinner after the label, as while a sent command waits for its answer. */
    busy?: boolean;
    children: Snippet;
  }

  interface ActionProps extends Common, Omit<HTMLButtonAttributes, 'children'> {
    variant?: 'default' | 'primary' | 'danger' | 'danger-solid';
    element?: HTMLButtonElement;
    href?: undefined;
  }

  /** A link drawn as a button; it cannot be a danger button, which carries a warning icon. */
  interface LinkProps extends Common, Omit<HTMLAnchorAttributes, 'children'> {
    variant?: 'default' | 'primary';
    element?: undefined;
    href: string;
  }

  type Props = ActionProps | LinkProps;

  let {
    variant = 'default',
    size = 'block',
    type = 'button',
    icon,
    fit = false,
    busy = false,
    element = $bindable(),
    href,
    children,
    ...rest
  }: Props = $props();
  const danger = $derived(variant === 'danger' || variant === 'danger-solid');
</script>

{#snippet label()}
  {#if fit}<span data-part="label" use:fitText>{@render children()}</span
    >{:else}{@render children()}{/if}{#if busy}<Spinner spaced={false} />{/if}
{/snippet}

{#if href !== undefined}
  <a
    {...rest as HTMLAnchorAttributes}
    {href}
    class={['button', 'kit-button', 'hit-area', variant, size, rest.class]}
    >{@render icon?.()}{@render label()}</a
  >
{:else}
  <button
    {...rest as HTMLButtonAttributes}
    type={type as HTMLButtonAttributes['type']}
    bind:this={element}
    class={['button', 'kit-button', 'hit-area', variant, size, rest.class]}
    >{#if danger}<WarningIcon />{:else}{@render icon?.()}{/if}{@render label()}</button
  >
{/if}

<style>
  .button :global(.warning-icon) {
    margin-inline-end: 0;
  }

  /* Line heights as lengths, so a label shrunk to fit keeps the button's height. */
  .block [data-part='label'] {
    line-height: 0.9375rem;
  }

  .small [data-part='label'] {
    line-height: 0.8125rem;
  }
</style>
