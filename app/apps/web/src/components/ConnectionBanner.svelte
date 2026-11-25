<script lang="ts">
  import { untrack } from 'svelte';
  import type {
    ConnectionPhase,
    ConnectionState,
    Localiser,
    OpponentState,
  } from '@wwd/client-core';
  import Banner from '../kit/Banner.svelte';
  import Spinner from '../kit/Spinner.svelte';
  import { countdownText, liveNow } from '../now.svelte.js';
  import { isStalePage, reloadApp } from '../pwa/update.js';
  import { stopReasonText } from '../text.js';
  import Button from './Button.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';

  interface Props {
    localiser: Localiser;
    connection: ConnectionState;
    opponent: OpponentState;
    /** The client's latest problem code, which explains a rejection. */
    lastError: string | null;
    onClaimWin: () => void;
  }

  let { localiser: l, connection, opponent, lastError, onClaimWin }: Props = $props();
  const uid = $props.id();

  const PHASES: Readonly<Record<ConnectionPhase, string>> = {
    online: 'connection-online',
    connecting: 'connection-connecting',
    offline: 'connection-offline',
    hidden: 'connection-hidden',
  };

  const phaseText = $derived(
    l.t(
      connection.stopReason !== null
        ? 'connection-stopped'
        : connection.serverUnavailable
          ? 'connection-server-unavailable'
          : PHASES[connection.phase],
    ),
  );
  const stopText = $derived(stopReasonText(l, connection.stopReason, lastError));
  const reconnecting = $derived(
    connection.stopReason === null &&
      !connection.serverUnavailable &&
      (connection.phase === 'connecting' || connection.phase === 'offline'),
  );
  const claimable = $derived(!opponent.connected && opponent.can_claim_win === true);
  const deadline = $derived(opponent.connected || claimable ? undefined : opponent.grace_deadline);
  const now = liveNow(() => deadline);
  // Being connected is not news: that line, or the whole strip, stays only for screen readers.
  const connected = $derived(
    connection.phase === 'online' && stopText === null && !connection.serverUnavailable,
  );
  const quiet = $derived(connected && deadline === undefined && !claimable);
  const reloadable = $derived(stopText !== null && isStalePage(connection.stopReason, lastError));
  const claimOffered = $derived(deadline === undefined && claimable);

  let keepWaiting = $state(false);
  let confirming = $state(false);
  /** Announces changes in the opponent's connection, never the ticking countdown. */
  let announcement = $state('');
  let wasConnected = untrack(() => opponent.connected);
  let wasClaimable = untrack(() => claimable);
  let announcedAway = false;

  $effect(() => {
    const connected = opponent.connected;
    const canClaim = claimable;
    untrack(() => {
      if (wasConnected && !connected) {
        announcement = l.t('opponent-disconnected');
        announcedAway = true;
      } else if (!wasConnected && connected && announcedAway) {
        announcement = l.t('opponent-reconnected');
        announcedAway = false;
      }
      if (canClaim && !wasClaimable) announcement = l.t('opponent-reconnect-over');
      // A fresh claim offer starts again from its first question.
      if (!canClaim) {
        keepWaiting = false;
        confirming = false;
      }
      wasConnected = connected;
      wasClaimable = canClaim;
    });
  });
</script>

{#snippet actions()}
  {#if reloadable}
    <Button size="small" onclick={() => void reloadApp()}>{l.t('update-reload')}</Button>
  {/if}
  {#if claimOffered}
    <Button
      size="small"
      data-testid="claim-win"
      aria-haspopup="dialog"
      onclick={() => (confirming = true)}>{l.t('claim-win')}</Button
    >
    {#if !keepWaiting}
      <Button size="small" data-testid="keep-waiting" onclick={() => (keepWaiting = true)}
        >{l.t('claim-keep-waiting')}</Button
      >
    {/if}
  {/if}
{/snippet}

<Banner
  icon="warning"
  actions={reloadable || claimOffered ? actions : undefined}
  aria-labelledby="{uid}-heading"
  class={{ 'visually-hidden': quiet }}
  data-testid="connection-banner"
>
  <h2 id="{uid}-heading" class="visually-hidden">{l.t('connection-heading')}</h2>
  <p role="status" class={{ 'visually-hidden': connected }} data-testid="connection-phase">
    {phaseText}{#if reconnecting}<Spinner />{/if}
  </p>
  {#if stopText !== null}
    <p role="alert" data-testid="connection-stopped">{stopText}</p>
  {/if}
  <p role="status" class="visually-hidden" data-testid="opponent-announcement">{announcement}</p>
  {#if deadline !== undefined}
    <p data-testid="opponent-away">
      {l.t('opponent-reconnecting', {
        time: countdownText(l, deadline, now.current),
      })}<Spinner />
    </p>
  {:else if claimable}
    <p data-testid="opponent-away">
      {l.t(keepWaiting ? 'opponent-still-waiting' : 'opponent-reconnect-over')}
    </p>
    {#if confirming}
      <ConfirmDialog
        title={l.t('claim-confirm')}
        confirmLabel={l.t('claim-win')}
        cancelLabel={l.t('claim-keep-waiting')}
        onConfirm={() => {
          confirming = false;
          onClaimWin();
        }}
        onCancel={() => {
          confirming = false;
          keepWaiting = true;
        }}
      />
    {/if}
  {/if}
</Banner>
