<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import Dialog from '../kit/Dialog.svelte';
  import { hrefFor, navigate } from '../router.js';
  import { serverHost } from '../online.js';
  import Button from './Button.svelte';

  interface Props {
    localiser: Localiser;
    server: string;
    onContinue: () => void;
  }

  let { localiser: l, server, onContinue }: Props = $props();
</script>

<Dialog
  title={l.t('server-confirm', { host: serverHost(server) })}
  role="alertdialog"
  data-testid="server-confirm"
  oncancel={() => navigate('home')}
>
  {#snippet actions()}
    <Button variant="primary" data-testid="server-continue" onclick={onContinue}
      >{l.t('server-continue')}</Button
    >
    <Button href={hrefFor('home')} data-testid="server-cancel" data-autofocus
      >{l.t('server-cancel')}</Button
    >
  {/snippet}
</Dialog>
