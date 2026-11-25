<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Seat } from '@wwd/engine';
  import type { Localiser, PauseState } from '@wwd/client-core';
  import Button from '../components/Button.svelte';
  import Panel from '../kit/Panel.svelte';
  import Spinner from '../kit/Spinner.svelte';
  import { handPrimary } from './primary.svelte.js';

  interface Props {
    localiser: Localiser;
    pause: PauseState;
    seat: Seat;
    onAccept: () => void;
    onCancel: () => void;
    onResume: () => void;
    /** Shown while paused, such as an invite for an opponent who has yet to join. */
    children?: Snippet;
  }

  let { localiser: l, pause, seat, onAccept, onCancel, onResume, children }: Props = $props();
  const uid = $props.id();

  const mine = $derived(pause.requestedBy === seat);
  const ready = $derived(pause.resumeReady.includes(seat));
  const opponentReady = $derived(pause.resumeReady.some((s) => s !== seat));
  const active = $derived(pause.requestedBy !== null || pause.paused);
  // While paused this is only who is ready, since focus on the heading already says it is paused.
  const statusText = $derived(
    !active
      ? ''
      : pause.paused
        ? ready
          ? l.t('resume-waiting')
          : opponentReady
            ? l.t('resume-opponent-ready')
            : ''
        : pause.agreed
          ? l.t('pause-agreed')
          : l.t(mine ? 'pause-requested-you' : 'pause-requested-opponent'),
  );

  /** Whether this seat waits for the opponent: to agree to its pause, or to resume. */
  const waiting = $derived(
    pause.paused ? ready : pause.requestedBy !== null && mine && !pause.agreed,
  );

  const hosted = handPrimary(
    () => resumeButton,
    () => pause.paused,
  );
</script>

{#snippet resumeButton()}
  <!-- Stays in place once asked, so focus is not lost. -->
  <Button
    variant="primary"
    data-testid="resume"
    aria-disabled={ready}
    onclick={() => {
      if (!ready) onResume();
    }}>{l.t('resume')}</Button
  >
{/snippet}

<!-- Always present, so that each change to the pause is read out. -->
<p role="status" class="visually-hidden" data-testid="pause-announcement">{statusText}</p>
{#if active}
  <Panel tight role="region" aria-labelledby="{uid}-heading" data-testid="pause-panel">
    <div class="content">
      {#if pause.paused}
        <h2 id="{uid}-heading" class="title" tabindex="-1" data-focus="paused">
          {l.t('paused-heading')}
        </h2>
        <p>{l.t('paused-detail')}</p>
      {:else}
        <h2 id="{uid}-heading" class="title">{l.t('pause-heading')}</h2>
      {/if}
      {#if statusText !== ''}
        <p data-testid="pause-status">
          {statusText}{#if waiting}<Spinner />{/if}
        </p>
      {/if}
      {#if pause.paused}
        {#if !hosted}{@render resumeButton()}{/if}
        {@render children?.()}
      {:else if !pause.agreed && !mine}
        <ul class="actions">
          <li>
            <Button data-testid="pause-accept" onclick={onAccept}>{l.t('pause-accept')}</Button>
          </li>
          <li>
            <Button data-testid="pause-decline" onclick={onCancel}>{l.t('pause-decline')}</Button>
          </li>
        </ul>
      {:else}
        <Button data-testid="pause-cancel" onclick={onCancel}>{l.t('pause-cancel')}</Button>
      {/if}
    </div>
  </Panel>
{/if}

<style>
  .content {
    display: grid;
    font-size: 0.875rem;
    gap: 6px;
  }

  .title {
    font: 400 1.0625rem/1.3 var(--font-label);
    margin: 0;
  }

  p {
    margin: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .actions li {
    flex: 1 1 0;
    margin: 0;
  }
</style>
