<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import { frame } from '../frame.svelte.js';

  interface Props {
    localiser: Localiser;
    /**
     * `page` sits below a screen and gives way to a screen that fits the viewport, which shows
     * the notice itself (in its game menu or at its foot); `inline` is that screen's own copy.
     */
    placement: 'page' | 'inline';
  }

  let { localiser: l, placement }: Props = $props();
</script>

{#if placement === 'inline' || frame.fitScreens === 0}
  <p class={['notice', { 'page-width': placement === 'page' }]} data-testid="unofficial-notice">
    {l.t('footer-unofficial')}
  </p>
{/if}

<style>
  .notice {
    font-size: 0.75rem;
  }

  .notice:not(.page-width) {
    text-align: center;
  }
</style>
