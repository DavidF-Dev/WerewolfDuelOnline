<script lang="ts">
  import type { Snippet } from 'svelte';
  import Dialog from '../kit/Dialog.svelte';
  import Button from './Button.svelte';

  interface Props {
    title: string;
    detail?: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
    /** Marks the question as destructive: the title and the confirming button carry the warning icon. */
    danger?: boolean;
    /** The id of an element holding the full description, when `detail` alone is not enough. */
    describedBy?: string;
    /** Extra content shown below the detail. */
    children?: Snippet;
    /** Safe alternatives to answering, such as exporting a backup first, shown above the answers. */
    alternatives?: Snippet;
  }

  let {
    title,
    detail,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    danger = false,
    describedBy,
    children,
    alternatives,
  }: Props = $props();
  const uid = $props.id();
  // Only the first answer counts, until the owner removes the dialog.
  let answered = $state(false);

  function answer(confirmed: boolean): void {
    if (answered) return;
    answered = true;
    if (confirmed) onConfirm();
    else onCancel();
  }
</script>

<!-- Focus starts on the safe answer. -->
<Dialog
  {title}
  role="alertdialog"
  {danger}
  describedby={describedBy ?? (detail === undefined ? undefined : `${uid}-detail`)}
  data-testid="confirm-dialog"
  oncancel={() => answer(false)}
>
  {#if detail !== undefined}
    <p id="{uid}-detail">{detail}</p>
  {/if}
  {@render children?.()}
  {#snippet actions()}
    {@render alternatives?.()}
    <Button
      variant={danger ? 'danger-solid' : 'primary'}
      data-testid="confirm-yes"
      aria-disabled={answered || undefined}
      onclick={() => answer(true)}>{confirmLabel}</Button
    >
    <Button
      data-testid="confirm-no"
      data-autofocus
      aria-disabled={answered || undefined}
      onclick={() => answer(false)}>{cancelLabel}</Button
    >
  {/snippet}
</Dialog>
