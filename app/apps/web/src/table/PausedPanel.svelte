<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Seat } from '@wwd/engine';
  import type { Localiser, PauseState } from '@wwd/client-core';

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
</script>

<!-- Always present, so that each change to the pause is read out. -->
<p role="status" class="visually-hidden" data-testid="pause-announcement">{statusText}</p>
{#if active}
  <section aria-labelledby="{uid}-heading" data-testid="pause-panel">
    {#if pause.paused}
      <h2 id="{uid}-heading" tabindex="-1" data-focus="paused">{l.t('paused-heading')}</h2>
      <p>{l.t('paused-detail')}</p>
    {:else}
      <h2 id="{uid}-heading">{l.t('pause-heading')}</h2>
    {/if}
    {#if statusText !== ''}
      <p data-testid="pause-status">{statusText}</p>
    {/if}
    {#if pause.paused}
      <!-- Stays in place once asked, so focus is not lost. -->
      <button
        type="button"
        data-testid="resume"
        aria-disabled={ready}
        onclick={() => {
          if (!ready) onResume();
        }}>{l.t('resume')}</button
      >
      {@render children?.()}
    {:else if !pause.agreed && !mine}
      <ul class="actions">
        <li>
          <button type="button" data-testid="pause-accept" onclick={onAccept}
            >{l.t('pause-accept')}</button
          >
        </li>
        <li>
          <button type="button" data-testid="pause-decline" onclick={onCancel}
            >{l.t('pause-decline')}</button
          >
        </li>
      </ul>
    {:else}
      <button type="button" data-testid="pause-cancel" onclick={onCancel}
        >{l.t('pause-cancel')}</button
      >
    {/if}
  </section>
{/if}

<style>
  section {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 0 0.75rem 0.75rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }
</style>
