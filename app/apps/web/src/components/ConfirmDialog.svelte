<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  interface Props {
    title: string;
    detail?: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
    /** Extra content shown below the detail. */
    children?: Snippet;
  }

  let { title, detail, confirmLabel, cancelLabel, onConfirm, onCancel, children }: Props = $props();
  const uid = $props.id();
  let dialog: HTMLDialogElement | undefined;
  let cancel: HTMLButtonElement | undefined;
  // Set once an answer is given, so closing afterwards is not taken as a second one.
  let answered = false;

  // Modal while mounted; focus starts on the safe answer and returns where it was on close.
  onMount(() => {
    const opener = document.activeElement;
    dialog?.showModal();
    cancel?.focus();
    return () => {
      answered = true;
      if (dialog?.open === true) dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  });

  function answer(confirmed: boolean): void {
    answered = true;
    if (confirmed) onConfirm();
    else onCancel();
  }

  function cancelled(event: Event): void {
    event.preventDefault();
    answer(false);
  }

  // The browser may close a modal dialog itself, for example on Escape without a `cancel` event.
  function closed(): void {
    if (!answered) answer(false);
  }
</script>

<dialog
  role="alertdialog"
  aria-labelledby="{uid}-title"
  aria-describedby={detail === undefined ? undefined : `${uid}-detail`}
  data-testid="confirm-dialog"
  bind:this={dialog}
  oncancel={cancelled}
  onclose={closed}
>
  <p id="{uid}-title"><strong>{title}</strong></p>
  {#if detail !== undefined}
    <p id="{uid}-detail">{detail}</p>
  {/if}
  {@render children?.()}
  <button type="button" data-testid="confirm-yes" onclick={() => answer(true)}
    >{confirmLabel}</button
  >
  <button type="button" data-testid="confirm-no" bind:this={cancel} onclick={() => answer(false)}
    >{cancelLabel}</button
  >
</dialog>
