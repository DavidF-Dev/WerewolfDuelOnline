<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import ConfirmDialog from './ConfirmDialog.svelte';

  interface Props {
    localiser: Localiser;
    /** The opponent's name, or null when this device never learnt it. */
    opponent: string | null;
    /** Whether the game is over, so removing it loses nothing but the shortcut. */
    finished: boolean;
    onremove: () => void;
    oncancel: () => void;
  }

  let { localiser: l, opponent, finished, onremove, oncancel }: Props = $props();
  const uid = $props.id();
</script>

<ConfirmDialog
  title={l.t('home-remove-title')}
  confirmLabel={l.t('home-remove-confirm')}
  cancelLabel={l.t('home-remove-cancel')}
  describedBy="{uid}-body"
  danger
  onConfirm={onremove}
  onCancel={oncancel}
>
  <div id="{uid}-body">
    <p><b>{opponent ?? l.t('home-opponent-unknown')}</b></p>
    <p>{l.t(finished ? 'home-remove-body-finished' : 'home-remove-body')}</p>
  </div>
</ConfirmDialog>
