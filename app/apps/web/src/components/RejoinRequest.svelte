<script lang="ts">
  import type { Localiser, OpponentState } from '@wwd/client-core';
  import { countdownText, liveNow } from '../now.svelte.js';
  import ConfirmDialog from './ConfirmDialog.svelte';

  interface Props {
    localiser: Localiser;
    /** Whether a device without the PIN is asking to take the opponent's seat. */
    requested: boolean;
    /** When the request expires, in epoch milliseconds; the dialog closes itself then. */
    deadline: number | null;
    /** The latest opponent status; each one with `pin_attempt_failed` raises the warning again. */
    opponent: OpponentState;
    /** Sends the answer; false when it could not be sent, which offers the question again. */
    onAnswer: (approve: boolean) => boolean | void;
  }

  let { localiser: l, requested, deadline, opponent, onAnswer }: Props = $props();

  /** How long the wrong-PIN warning stays up unless another opponent status replaces it. */
  const PIN_WARNING_MS = 10_000;

  const now = liveNow(() => (requested ? deadline : null));
  const open = $derived(requested && (deadline === null || now.current < deadline));

  // Each answer that could not be sent asks again with a fresh dialog, since a dialog answers only once.
  let failures = $state(0);

  function answer(approve: boolean): void {
    if (onAnswer(approve) === false) failures += 1;
  }

  let pinWarning = $state(false);
  $effect(() => {
    const failed = opponent.pin_attempt_failed === true;
    pinWarning = failed;
    if (!failed) return;
    const timer = setTimeout(() => (pinWarning = false), PIN_WARNING_MS);
    return () => clearTimeout(timer);
  });
</script>

{#if pinWarning}
  <p role="alert" data-testid="pin-attempt-failed">{l.t('pin-attempt-failed')}</p>
{/if}
{#if open}
  {#key failures}
    <ConfirmDialog
      title={l.t('rejoin-request-title')}
      detail={l.t('rejoin-request-detail')}
      confirmLabel={l.t('rejoin-allow')}
      cancelLabel={l.t('rejoin-deny')}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    >
      {#if deadline !== null}
        <p data-testid="rejoin-expires">
          {l.t('rejoin-request-expires', { time: countdownText(l, deadline, now.current) })}
        </p>
      {/if}
    </ConfirmDialog>
  {/key}
{/if}
