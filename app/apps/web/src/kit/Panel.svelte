<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import Label from './Label.svelte';

  interface Props extends HTMLAttributes<HTMLElement> {
    /** The panel's label; a titled panel is a region named by it. */
    title?: string;
    /** Less padding, for the dense game screens. */
    tight?: boolean;
    /** The id of the title's heading, so that something inside can be named by it too. */
    titleId?: string;
    children: Snippet;
  }

  let { title, tight = false, titleId, children, ...rest }: Props = $props();
  const uid = $props.id();
  const headingId = $derived(titleId ?? `${uid}-title`);
</script>

{#if title === undefined}
  <div {...rest} class={['panel', { tight }, rest.class]}>{@render children()}</div>
{:else}
  <section {...rest} class={['panel', { tight }, rest.class]} aria-labelledby={headingId}>
    <Label as="h2" id={headingId}>{title}</Label>
    {@render children()}
  </section>
{/if}

<style>
  .panel {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 8%, transparent);
    min-width: 0;
    padding: 10px;
  }

  .tight {
    padding: 7px 9px;
  }
</style>
