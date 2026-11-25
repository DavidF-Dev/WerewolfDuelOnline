<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import WarningIcon from '../components/WarningIcon.svelte';

  interface Props {
    title: string;
    /** `alertdialog` for a question that needs an answer before anything else. */
    role?: 'dialog' | 'alertdialog';
    /** Marks a destructive question: the title starts with the warning icon. */
    danger?: boolean;
    /** The id of the element describing the dialog. */
    describedby?: string;
    /** Called on Escape; the dialog stays open until its owner removes it. */
    oncancel: () => void;
    'data-testid'?: string;
    children?: Snippet;
    /** The answers, stacked full width: a safe alternative first, then the main answer, then Cancel. */
    actions?: Snippet;
  }

  let {
    title,
    role = 'dialog',
    danger = false,
    describedby,
    oncancel,
    'data-testid': testId,
    children,
    actions,
  }: Props = $props();
  const uid = $props.id();
  let dialog: HTMLDialogElement | undefined;
  let removed = false;

  // Modal while mounted; focus starts on an element marked `data-autofocus` and returns on close.
  onMount(() => {
    const opener = document.activeElement;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      removed = true;
      if (dialog?.open === true) dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  });

  function cancelled(event: Event): void {
    event.preventDefault();
    oncancel();
  }

  // The browser may close a modal dialog itself, for example on a repeated Escape without a `cancel` event.
  function closed(): void {
    if (!removed) oncancel();
  }
</script>

<dialog
  class="dialog"
  {role}
  aria-labelledby="{uid}-title"
  aria-describedby={describedby}
  data-testid={testId}
  bind:this={dialog}
  oncancel={cancelled}
  onclose={closed}
>
  <h2 id="{uid}-title" class="title">
    {#if danger}<WarningIcon />{/if}<span>{title}</span>
  </h2>
  {@render children?.()}
  {#if actions}
    <div class="actions" data-part="dialog-actions">{@render actions()}</div>
  {/if}
</dialog>

<style>
  .dialog {
    background: var(--surface);
    border: 0;
    border-radius: 14px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
    color: var(--ink);
    max-height: calc(100vh - 28px);
    max-height: calc(100dvh - 28px);
    max-width: min(calc(30rem - 28px), calc(100vw - 28px));
    overflow: auto;
    padding: 14px;
    width: 100%;
  }

  .dialog[open] {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .dialog::backdrop {
    background: rgba(10, 14, 22, 0.55);
  }

  .title {
    align-items: baseline;
    display: flex;
    font-family: var(--font-label);
    font-size: 1.0625rem;
    font-weight: 400;
    gap: 0.35em;
    line-height: 1.25;
    margin: 0;
  }

  /* Centred on the first line: half of what the 1.25 line height adds to the 1em icon. */
  .title :global(.warning-icon) {
    align-self: flex-start;
    margin-block-start: 0.125em;
    margin-inline-end: 0;
  }

  .dialog :global(:is(p, ul)) {
    font-size: 0.8125rem;
    margin: 0 0 6px;
  }

  .dialog :global(ul) {
    padding-left: 18px;
  }

  .dialog :global(li + li) {
    margin-top: 2px;
  }

  .dialog :global(.note) {
    font-size: 0.75rem;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
