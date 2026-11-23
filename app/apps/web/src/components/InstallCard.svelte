<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import { promptInstall } from '../pwa/install.js';

  interface Props {
    localiser: Localiser;
    /** How this browser installs the app: its own prompt, or the iOS Share menu. */
    platform: 'prompt' | 'ios';
    onDismiss: () => void;
  }

  let { localiser: l, platform, onDismiss }: Props = $props();
  const uid = $props.id();
</script>

<section class="card" aria-labelledby="{uid}-heading" data-testid="install-card">
  <h2 id="{uid}-heading">{l.t('install-card-heading')}</h2>
  <p>{l.t(platform === 'ios' ? 'install-card-text-ios' : 'install-card-text')}</p>
  {#if platform === 'ios'}
    <p>{l.t('install-ios-steps')}</p>
  {/if}
  <div class="actions">
    {#if platform === 'prompt'}
      <button type="button" onclick={() => void promptInstall()}>{l.t('install-button')}</button>
    {/if}
    <button type="button" onclick={onDismiss}>{l.t('install-card-dismiss')}</button>
  </div>
</section>

<style>
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    margin-block: 1rem;
    padding: 0.5rem 1rem 1rem;
  }

  h2 {
    font-size: 1.125rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
