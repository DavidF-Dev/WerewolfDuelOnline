<script lang="ts">
  import { onMount } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import { hrefFor } from '../router.js';
  import { serverHost } from '../online.js';

  interface Props {
    localiser: Localiser;
    server: string;
    onContinue: () => void;
  }

  let { localiser: l, server, onContinue }: Props = $props();
  const uid = $props.id();
  let heading: HTMLElement | undefined;

  onMount(() => heading?.focus());
</script>

<section aria-labelledby="{uid}-heading" data-testid="server-confirm">
  <h2 id="{uid}-heading" tabindex="-1" bind:this={heading}>
    {l.t('server-confirm', { host: serverHost(server) })}
  </h2>
  <ul>
    <li>
      <button type="button" data-testid="server-continue" onclick={onContinue}
        >{l.t('server-continue')}</button
      >
    </li>
    <li><a href={hrefFor('home')} data-testid="server-cancel">{l.t('server-cancel')}</a></li>
  </ul>
</section>
