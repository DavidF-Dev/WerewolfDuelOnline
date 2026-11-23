<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import WarningIcon from './WarningIcon.svelte';

  type ExportResult = 'saved' | 'cancelled' | 'failed';

  interface Props {
    localiser: Localiser;
    /** What is being deleted: the finished games only, or everything on the device. */
    scope: 'history' | 'all';
    onConfirm: () => void;
    onCancel: () => void;
    onExport: () => Promise<ExportResult>;
  }

  let { localiser: l, scope, onConfirm, onCancel, onExport }: Props = $props();
  const uid = $props.id();
  let exported = $state<ExportResult | null>(null);
  let exporting = $state(false);

  async function exportFirst(): Promise<void> {
    if (exporting) return;
    exporting = true;
    exported = null;
    try {
      exported = await onExport();
    } catch {
      exported = 'failed';
    } finally {
      exporting = false;
    }
  }
</script>

<ConfirmDialog
  title={l.t(scope === 'all' ? 'delete-all-title' : 'delete-history-title')}
  confirmLabel={l.t(scope === 'all' ? 'delete-all-confirm' : 'delete-history-confirm')}
  cancelLabel={l.t('delete-cancel')}
  describedBy="{uid}-body"
  danger
  {onConfirm}
  {onCancel}
>
  {#snippet confirmIcon()}<WarningIcon />{/snippet}
  <div id="{uid}-body">
    <p>{l.t(scope === 'all' ? 'delete-all-intro' : 'delete-history-intro')}</p>
    <ul>
      {#if scope === 'all'}
        <li>{l.t('delete-item-settings')}</li>
      {/if}
      <li>{l.t('delete-item-history')}</li>
      {#if scope === 'all'}
        <li>{l.t('delete-item-games')}</li>
      {/if}
    </ul>
    {#if scope === 'history'}
      <p>{l.t('delete-history-keeps')}</p>
    {/if}
    <p class="note">{l.t('delete-device-only')}</p>
  </div>
  <p>
    <button type="button" aria-disabled={exporting ? 'true' : undefined} onclick={exportFirst}>
      {l.t('delete-export-first')}
    </button>
  </p>
  <p class="note">{l.t('backup-seat-token-warning')}</p>
  {#if exported === 'saved'}
    <p role="status">{l.t('backup-saved')}</p>
  {:else if exported === 'failed'}
    <p role="alert"><WarningIcon />{l.t('backup-save-failed')}</p>
  {/if}
</ConfirmDialog>
