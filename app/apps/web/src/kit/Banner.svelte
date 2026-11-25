<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import WarningIcon from '../components/WarningIcon.svelte';
  import Icon from './Icon.svelte';

  interface Props extends HTMLAttributes<HTMLElement> {
    /** The decorative icon before the text: a warning, or a new version of the app. */
    icon: 'warning' | 'update';
    children: Snippet;
    /** What can be done about it, such as reloading; drawn as small buttons at the end. */
    actions?: Snippet;
  }

  let { icon, children, actions, ...rest }: Props = $props();
</script>

<section {...rest} class={['kit-banner', icon, rest.class]}>
  <span class="icon">
    {#if icon === 'warning'}<WarningIcon />{:else}<Icon name={icon} />{/if}
  </span>
  <div class="text">{@render children()}</div>
  {#if actions}
    <div class="actions">{@render actions()}</div>
  {/if}
</section>

<style>
  .kit-banner {
    align-items: center;
    --tone: var(--warn);
    background: color-mix(in srgb, var(--tone) 12%, var(--surface));
    border-bottom: 1px solid var(--line);
    border-inline-start: 3px solid var(--tone);
    display: flex;
    flex-wrap: wrap;
    font-size: 0.8125rem;
    gap: 4px 8px;
    line-height: 1.35;
    padding: 6px 12px 6px 9px;
  }

  .update {
    --tone: var(--accent);
  }

  .icon {
    color: var(--tone);
    display: grid;
    flex: none;
    place-items: center;
  }

  .icon :global(svg) {
    height: 1.125rem;
    margin: 0;
    width: 1.125rem;
  }

  .text {
    display: grid;
    flex: 1 1 10rem;
    gap: 2px;
    min-width: 0;
  }

  .text :global(p) {
    margin: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-inline-start: auto;
  }

  /* A little shorter than elsewhere so that a wrapped row keeps the strip slim; the hit area stays full size. */
  .actions :global(.button) {
    padding-block: 6px;
  }
</style>
