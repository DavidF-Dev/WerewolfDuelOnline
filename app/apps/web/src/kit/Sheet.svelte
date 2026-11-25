<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import IconButton from './IconButton.svelte';

  interface Props {
    title: string;
    closeLabel: string;
    /** Asks the owner to close the sheet, which it does by no longer showing it. */
    onclose: () => void;
    testId?: string;
    children: Snippet;
  }

  let { title, closeLabel, onclose, testId, children }: Props = $props();
  const uid = $props.id();
  let dialog: HTMLDialogElement | undefined;
  let closing = false;

  // Modal while mounted; focus moves into the sheet and returns where it was on close.
  onMount(() => {
    const opener = document.activeElement;
    dialog?.showModal();
    const first = dialog?.querySelector<HTMLElement>(
      '[data-part="sheet-body"] :is(button, a[href], input, select, textarea):not(:disabled)',
    );
    (first ?? dialog?.querySelector<HTMLElement>('.close'))?.focus();
    return () => {
      closing = true;
      if (dialog?.open === true) dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  });

  function cancelled(event: Event): void {
    event.preventDefault();
    onclose();
  }

  // The browser may close a modal dialog itself, for example on Escape without a `cancel` event.
  function closed(): void {
    if (!closing) onclose();
  }
</script>

<dialog
  class="sheet"
  aria-labelledby="{uid}-title"
  data-testid={testId}
  bind:this={dialog}
  oncancel={cancelled}
  onclose={closed}
>
  <div class="head">
    <h2 id="{uid}-title">{title}</h2>
    <IconButton class="close" icon="close" label={closeLabel} onclick={onclose} />
  </div>
  <div class="body" data-part="sheet-body">{@render children()}</div>
</dialog>

<style>
  .sheet {
    background: var(--surface);
    border: 0;
    border-radius: 14px 14px 0 0;
    box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.35);
    color: var(--ink);
    inset: auto 0 0;
    margin: 0 auto;
    max-height: 85vh;
    max-height: 85dvh;
    max-width: 30rem;
    overflow: auto;
    padding: 14px;
    width: 100%;
  }

  .sheet[open] {
    animation: rise var(--motion) ease-out;
  }

  .sheet::backdrop {
    background: rgba(10, 14, 22, 0.55);
  }

  .head {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  h2 {
    font-family: var(--font-label);
    font-size: 1.0625rem;
    font-weight: 400;
    line-height: 1.25;
    margin: 0;
  }

  .body {
    display: flex;
    flex-direction: column;
    font-size: 0.8125rem;
    gap: 8px;
  }

  @keyframes rise {
    from {
      transform: translateY(100%);
    }
  }
</style>
