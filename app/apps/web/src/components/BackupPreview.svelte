<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import type { BackupPreview } from '../backup/import.js';

  interface Props {
    localiser: Localiser;
    preview: BackupPreview;
    /** Whether the backup's settings should replace this device's. */
    replaceSettings: boolean;
  }

  let { localiser: l, preview, replaceSettings = $bindable() }: Props = $props();
</script>

<ul>
  <li>{l.t('backup-preview-games', { count: preview.games })}</li>
  <li>{l.t('backup-preview-sessions', { count: preview.sessions })}</li>
  <li>
    {l.t(
      preview.settingsDiffer ? 'backup-preview-settings-differ' : 'backup-preview-settings-same',
    )}
  </li>
  {#if preview.skipped > 0}
    <li>{l.t('backup-preview-skipped', { count: preview.skipped })}</li>
  {/if}
</ul>
{#if preview.settingsDiffer}
  <label class="row">
    <input type="checkbox" bind:checked={replaceSettings} />
    <span>{l.t('backup-preview-replace-settings')}</span>
  </label>
{/if}
<p class="note">{l.t('backup-preview-merge-note')}</p>
