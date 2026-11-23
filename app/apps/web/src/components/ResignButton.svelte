<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import ConfirmDialog from './ConfirmDialog.svelte';

  interface Props {
    localiser: Localiser;
    onResign: () => void;
  }

  let { localiser: l, onResign }: Props = $props();
  let confirming = $state(false);
</script>

<button
  type="button"
  data-testid="resign"
  aria-haspopup="dialog"
  onclick={() => (confirming = true)}>{l.t('resign')}</button
>
{#if confirming}
  <ConfirmDialog
    title={l.t('resign-confirm')}
    confirmLabel={l.t('resign')}
    cancelLabel={l.t('resign-cancel')}
    onConfirm={() => {
      confirming = false;
      onResign();
    }}
    onCancel={() => (confirming = false)}
  />
{/if}
