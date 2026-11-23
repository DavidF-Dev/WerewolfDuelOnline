<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import { reloadApp, updateWaiting } from '../pwa/update.js';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();
</script>

<section
  class="update page-width"
  class:shown={$updateWaiting}
  aria-label={l.t('update-region')}
  data-testid="update-banner"
>
  <!-- The status stays in the page so that its text is announced when it appears. -->
  <p role="status">{$updateWaiting ? l.t('update-available') : ''}</p>
  {#if $updateWaiting}
    <button type="button" onclick={() => void reloadApp()}>{l.t('update-reload')}</button>
  {/if}
</section>

<style>
  .update {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    justify-content: space-between;
  }

  .shown {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    margin-block: 0.5rem;
    padding-block: 0.25rem;
  }

  p {
    margin: 0;
  }
</style>
