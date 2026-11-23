<script lang="ts">
  import type { Event, Seat } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { logLine } from '../text.js';

  interface Props {
    localiser: Localiser;
    seat: Seat;
    /** The event that ended the game, once it has arrived. */
    gameOver: Event | undefined;
    replayVerified: boolean | null;
    /** The seats that have asked for a rematch. */
    rematchReady: Seat[];
    /** Asks for a rematch; Rematch is left out while this is undefined. */
    onRematch?: () => void;
    /** Opens the finished game's replay; View replay is left out while this is undefined. */
    onViewReplay?: () => void;
  }

  let {
    localiser: l,
    seat,
    gameOver,
    replayVerified,
    rematchReady,
    onRematch,
    onViewReplay,
  }: Props = $props();
  const uid = $props.id();

  const asked = $derived(rematchReady.includes(seat));
  const opponentAsked = $derived(rematchReady.some((s) => s !== seat));
</script>

<section aria-labelledby="{uid}-over" data-testid="game-over">
  <h2 id="{uid}-over" tabindex="-1" data-focus="game-over">{l.t('game-over-heading')}</h2>
  {#if gameOver !== undefined}
    <p data-testid="game-over-result">{logLine(l, gameOver, seat)}</p>
  {/if}
  {#if replayVerified !== null}
    <p data-testid="replay-verified">
      {l.t(replayVerified ? 'replay-verified' : 'replay-unverified')}
    </p>
  {/if}
  {#if onViewReplay !== undefined}
    <p>
      <button type="button" data-testid="view-replay" onclick={onViewReplay}
        >{l.t('game-over-view-replay')}</button
      >
    </p>
  {/if}
  {#if onRematch !== undefined}
    <p role="status" data-testid="rematch-status">
      {asked ? l.t('rematch-waiting') : opponentAsked ? l.t('rematch-opponent-ready') : ''}
    </p>
    <p id="{uid}-rematch-hint">{l.t('rematch-hint')}</p>
    <!-- Stays in place once asked, so focus is not lost. -->
    <button
      type="button"
      data-testid="rematch"
      aria-describedby="{uid}-rematch-hint"
      aria-disabled={asked}
      onclick={() => {
        if (!asked) onRematch?.();
      }}>{l.t('rematch')}</button
    >
  {/if}
</section>
