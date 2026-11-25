<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import Banner from '../kit/Banner.svelte';
  import { markUpdateAnnounced, reloadApp, updateAnnounced, updateWaiting } from '../pwa/update.js';
  import Button from './Button.svelte';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();
  // A banner mounted on a later screen shows an update already announced without announcing it again.
  const live = !updateAnnounced();
  $effect(() => {
    if (live && $updateWaiting) markUpdateAnnounced();
  });
</script>

{#snippet actions()}
  <Button size="small" onclick={() => void reloadApp()}>{l.t('update-reload')}</Button>
{/snippet}

<!-- The region and its status stay in the page so that the status is announced when it appears. -->
<Banner
  icon="update"
  actions={$updateWaiting ? actions : undefined}
  class={{ 'visually-hidden': !$updateWaiting }}
  aria-label={l.t('update-region')}
  data-testid="update-banner"
>
  <p role={live ? 'status' : undefined}>{$updateWaiting ? l.t('update-available') : ''}</p>
</Banner>
