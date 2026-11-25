<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Icon, { type IconName } from './Icon.svelte';

  interface Props extends HTMLButtonAttributes {
    /** The button's accessible name; the icon itself is hidden. */
    label: string;
    icon: IconName;
    element?: HTMLButtonElement;
  }

  let { label, icon, type = 'button', element = $bindable(), ...rest }: Props = $props();
</script>

<button
  {...rest}
  {type}
  bind:this={element}
  class={['icon-button', 'hit-area', rest.class]}
  aria-label={label}
>
  <Icon name={icon} />
</button>

<style>
  .icon-button {
    align-items: center;
    background: color-mix(in srgb, currentColor 10%, transparent);
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 8px;
    color: inherit;
    display: grid;
    flex: none;
    height: 32px;
    min-height: 0;
    min-width: 0;
    padding: 0;
    place-items: center;
    width: 32px;
  }

  @media (hover: hover) and (pointer: fine) {
    .icon-button:hover:not(:disabled, [aria-disabled='true']) {
      background: color-mix(in srgb, currentColor 20%, transparent);
      border-color: color-mix(in srgb, currentColor 45%, transparent);
    }
  }
</style>
