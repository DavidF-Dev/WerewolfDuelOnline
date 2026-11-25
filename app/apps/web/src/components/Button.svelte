<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
  import WarningIcon from './WarningIcon.svelte';

  interface Common {
    /** `block` fills the width; `small` sits inline. */
    size?: 'block' | 'small';
    /** Decoration shown before the label; danger buttons always show the warning icon instead. */
    icon?: Snippet;
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
    element = $bindable(),
    href,
    children,
    ...rest
  }: Props = $props();
  const danger = $derived(variant === 'danger' || variant === 'danger-solid');
</script>

{#if href !== undefined}
  <a
    {...rest as HTMLAnchorAttributes}
    {href}
    class={['button', 'kit-button', 'hit-area', variant, size, rest.class]}
    >{@render icon?.()}{@render children()}</a
  >
{:else}
  <button
    {...rest as HTMLButtonAttributes}
    type={type as HTMLButtonAttributes['type']}
    bind:this={element}
    class={['button', 'kit-button', 'hit-area', variant, size, rest.class]}
    >{#if danger}<WarningIcon />{:else}{@render icon?.()}{/if}{@render children()}</button
  >
{/if}

<style>
  .button :global(.warning-icon) {
    margin-inline-end: 0;
  }
</style>
