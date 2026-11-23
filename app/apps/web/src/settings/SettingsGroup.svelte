<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    children: Snippet;
  }

  let { title, children }: Props = $props();
  const uid = $props.id();
</script>

<section class="group" aria-labelledby="{uid}-heading">
  <h2 id="{uid}-heading">{title}</h2>
  {@render children()}
</section>

<style>
  .group {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    margin-block: 1rem;
    padding: 0.5rem 1rem 1rem;
  }

  h2 {
    font-size: 1.125rem;
  }

  .group :global(.row) {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    justify-content: space-between;
    margin-block: 0.75rem;
  }
</style>
