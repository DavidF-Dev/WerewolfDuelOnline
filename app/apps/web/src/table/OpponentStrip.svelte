<script lang="ts">
  import type { PlayerView } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import Chip from '../kit/Chip.svelte';
  import { characterName, planStatus } from '../text.js';
  import MarkerList from './MarkerList.svelte';

  interface Props {
    localiser: Localiser;
    name: string;
    /** Whether the opponent is connected; the connection is left out while this is undefined. */
    connected?: boolean;
    player: PlayerView;
    hasBadge: boolean;
    /** Whether the opponent has nothing to do until this seat acts, outside the plan phase. */
    waitingForMe?: boolean;
  }

  let { localiser: l, name, connected, player, hasBadge, waitingForMe = false }: Props = $props();
  const sealed = $derived(typeof player.plan === 'object' && 'hidden' in player.plan);
  // A revealed plan names only its character here; its targets are told where it resolves.
  const status = $derived(
    typeof player.plan === 'object' && 'revealed' in player.plan
      ? l.t('plan-status-revealed', { plan: characterName(l, player.plan.revealed.character) })
      : typeof player.plan === 'object'
        ? l.t('opponent-plan-sealed', { count: player.plan.hidden.target_count })
        : planStatus(l, player.plan),
  );
</script>

<section
  class="strip"
  aria-label={l.t('opponent-heading', { name })}
  data-testid="opponent"
  data-part="opponent-strip"
>
  <div class="who">
    <div class="title">
      <h2 class="name" title={name}>{name}</h2>
      {#if connected !== undefined}
        <p class="connection" class:connected data-testid="opponent-connection">
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            {#if connected}
              <circle cx="8" cy="8" r="5" fill="currentColor" />
            {:else}
              <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" stroke-width="2" />
              <path d="M3 13 13 3" stroke="currentColor" stroke-width="2" />
            {/if}
          </svg>
          <span>{l.t(connected ? 'opponent-connected' : 'opponent-not-connected')}</span>
        </p>
      {/if}
    </div>
    <div class="facts">
      <span
        class="hand"
        data-testid="opponent-hand-size"
        title={l.t('count-hand', { n: player.hand_size })}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <rect
            x="3.5"
            y="1.5"
            width="9"
            height="13"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          />
        </svg>
        <span aria-hidden="true">{player.hand_size}</span>
        <span class="visually-hidden">{l.t('count-hand', { n: player.hand_size })}</span>
      </span>
      <MarkerList localiser={l} {player} {hasBadge} testId="opponent" badgeAtEnd />
    </div>
  </div>
  <Chip class="status" data-testid="opponent-plan">
    {#snippet icon()}{#if sealed && !waitingForMe}<span aria-hidden="true">✓</span>{/if}{/snippet}
    {waitingForMe ? l.t('opponent-waiting-for-you') : status}
  </Chip>
</section>

<style>
  .strip {
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 8%, transparent);
    display: grid;
    flex: none;
    gap: 2px 8px;
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 6px 9px;
  }

  .who {
    display: contents;
  }

  .title {
    align-items: center;
    display: flex;
    flex-wrap: nowrap;
    gap: 2px 8px;
    grid-column: 1;
    grid-row: 1;
    min-width: 0;
  }

  .name {
    font: 700 0.875rem / 1.3 var(--font-body);
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    margin: 0;
  }

  .connection {
    align-items: center;
    color: var(--muted);
    display: inline-flex;
    flex: none;
    font-size: 0.71875rem;
    gap: 3px;
    white-space: nowrap;
  }

  .connection.connected svg {
    color: var(--ok);
  }

  .connection svg {
    flex: none;
    height: 0.75rem;
    width: 0.75rem;
  }

  .facts {
    align-items: center;
    display: flex;
    flex-wrap: nowrap;
    gap: 2px 10px;
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .hand {
    flex: none;
    align-items: center;
    display: inline-flex;
    font-size: 0.75rem;
    font-weight: 700;
    gap: 2px;
  }

  .hand svg {
    color: var(--muted);
    height: 1.1em;
    width: 1.1em;
  }

  .strip :global(.status) {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
    white-space: nowrap;
  }
</style>
