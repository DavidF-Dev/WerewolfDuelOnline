<script lang="ts">
  import type { PlayerView } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { cardName, planStatus } from '../text.js';
  import Markers from './Markers.svelte';

  interface Props {
    localiser: Localiser;
    name: string;
    player: PlayerView;
    hasBadge: boolean;
  }

  let { localiser: l, name, player, hasBadge }: Props = $props();
  const uid = $props.id();
  const hand = $derived(player.hand ?? []);
</script>

<section aria-labelledby="{uid}-heading" data-testid="my-area">
  <h2 id="{uid}-heading">{l.t('my-area-heading', { name })}</h2>
  <Markers localiser={l} {player} {hasBadge} testId="my" />
  <p data-testid="my-plan">{planStatus(l, player.plan)}</p>
  <h3 id="{uid}-hand">{l.t('my-hand-heading')}</h3>
  {#if hand.length === 0}
    <p>{l.t('my-hand-empty')}</p>
  {:else}
    <ul aria-labelledby="{uid}-hand" data-testid="my-hand">
      {#each hand as c (c)}
        <li data-testid="card-{c}">{cardName(l, c)}</li>
      {/each}
    </ul>
  {/if}
</section>
