<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import Button from './Button.svelte';
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
  <p class="note" id="{uid}-tokens">{l.t('backup-seat-token-warning')}</p>
  {#if exported === 'failed'}
    <p role="alert"><WarningIcon />{l.t('backup-save-failed')}</p>
  {/if}
  <p role="status" class={{ 'visually-hidden': exported !== 'saved' }}>
    {exported === 'saved' ? l.t('backup-saved') : ''}
  </p>
  {#snippet alternatives()}
    <Button
      aria-disabled={exporting ? 'true' : undefined}
      aria-describedby="{uid}-tokens"
      onclick={exportFirst}>{l.t('delete-export-first')}</Button
    >
  {/snippet}
</ConfirmDialog>
