<script lang="ts">
  import type { PlayerView } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { planStatus } from '../text.js';
  import MarkerList from './MarkerList.svelte';

  interface Props {
    localiser: Localiser;
    name: string;
    connected: boolean;
    player: PlayerView;
    hasBadge: boolean;
  }

  let { localiser: l, name, connected, player, hasBadge }: Props = $props();
  const uid = $props.id();
</script>

<section class="strip" aria-labelledby="{uid}-heading" data-testid="opponent">
  <div class="title">
    <h2 id="{uid}-heading">{l.t('opponent-heading', { name })}</h2>
    <p class="connection" class:connected data-testid="opponent-connection">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {#if connected}
          <circle cx="8" cy="8" r="6" fill="currentColor" />
        {:else}
          <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="2" />
          <path d="M3 13 13 3" stroke="currentColor" stroke-width="2" />
        {/if}
      </svg>
      <span>{l.t(connected ? 'opponent-connected' : 'opponent-not-connected')}</span>
    </p>
  </div>
  <MarkerList localiser={l} {player} {hasBadge} testId="opponent" />
  <p class="facts">
    <span data-testid="opponent-hand-size">{l.t('count-hand', { n: player.hand_size })}</span>
    <span data-testid="opponent-plan">{planStatus(l, player.plan)}</span>
  </p>
</section>

<style>
  .strip {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem;
  }

  .title {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
  }

  h2 {
    font-size: 1.125rem;
    margin: 0;
    overflow-wrap: anywhere;
  }

  p {
    margin: 0;
  }

  .connection {
    align-items: center;
    color: var(--muted);
    display: inline-flex;
    gap: 0.25rem;
  }

  .connection.connected {
    color: var(--ok);
  }

  .connection svg {
    flex: none;
    height: 1em;
    width: 1em;
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
  }
</style>
