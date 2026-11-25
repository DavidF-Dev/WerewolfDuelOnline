<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import IconButton from '../kit/IconButton.svelte';
  import Panel from '../kit/Panel.svelte';
  import { promptInstall } from '../pwa/install.js';
  import Button from './Button.svelte';

  interface Props {
    localiser: Localiser;
    /** How this browser installs the app: its own prompt, or the iOS Share menu. */
    platform: 'prompt' | 'ios';
    onDismiss: () => void;
  }

  let { localiser: l, platform, onDismiss }: Props = $props();
  const uid = $props.id();
</script>

<Panel role="region" aria-labelledby="{uid}-heading" data-testid="install-card">
  <div class="head">
    <h2 id="{uid}-heading">{l.t('install-card-heading')}</h2>
    <IconButton icon="close" label={l.t('install-card-dismiss')} onclick={onDismiss} />
  </div>
  <p class="text">{l.t(platform === 'ios' ? 'install-card-text-ios' : 'install-card-text')}</p>
  {#if platform === 'ios'}
    <p class="text">{l.t('install-ios-steps')}</p>
  {:else}
    <Button size="small" variant="primary" onclick={() => void promptInstall()}
      >{l.t('install-button')}</Button
    >
  {/if}
</Panel>

<style>
  .head {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
  }

  h2 {
    font-family: var(--font-body);
    font-size: 0.9375rem;
    font-weight: 700;
    margin: 0;
  }

  .text {
    color: var(--muted);
    font-size: 0.75rem;
    margin: 4px 0 8px;
  }
</style>
