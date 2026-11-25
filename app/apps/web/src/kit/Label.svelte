<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** The element to draw as a label: a heading when it titles a region, `label` for a field. */
    as?: 'h2' | 'h3' | 'p' | 'span' | 'div' | 'label';
    id?: string;
    /** The field a `label` names. */
    for?: string;
    children: Snippet;
  }

  let { as = 'div', id, for: field, children }: Props = $props();
</script>

<svelte:element this={as} {id} for={as === 'label' ? field : undefined} class="label"
  >{@render children()}</svelte:element
>

<style>
  .label {
    color: var(--muted);
    font-family: var(--font-label);
    font-size: 0.6875rem;
    font-synthesis: none;
    font-weight: 400;
    letter-spacing: 0.06em;
    line-height: 1.3;
    margin: 0 0 4px;
    text-transform: uppercase;
  }
</style>
