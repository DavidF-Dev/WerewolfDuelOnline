<script lang="ts">
  import type { Snippet } from 'svelte';
  import Panel from '../kit/Panel.svelte';

  interface Props {
    title: string;
    children: Snippet;
  }

  let { title, children }: Props = $props();
</script>

<Panel {title} tight class="settings-group">{@render children()}</Panel>

<style>
  :global(.settings-group) {
    font-size: 0.875rem;
  }

  :global(.settings-group [data-part='setting']) {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0 12px;
    justify-content: space-between;
    margin: 0;
    min-height: var(--target);
  }

  :global(.settings-group [data-part='setting'] ~ [data-part='setting']) {
    border-top: 1px solid var(--line);
  }

  :global(.settings-group [data-part='setting-name']) {
    flex: 1 1 auto;
    min-width: 0;
  }

  :global(.settings-group [data-part='setting-control']) {
    align-items: center;
    display: inline-flex;
    flex: none;
    gap: 8px;
    margin-inline-start: auto;
    max-width: 100%;
  }
</style>
