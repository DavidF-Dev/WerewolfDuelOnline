<script lang="ts">
  import type { PlayerView } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { planStatus } from '../text.js';
  import Markers from './Markers.svelte';

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

<section aria-labelledby="{uid}-heading" data-testid="opponent">
  <h2 id="{uid}-heading">{l.t('opponent-heading', { name })}</h2>
  <p data-testid="opponent-connection">
    {l.t(connected ? 'opponent-connected' : 'opponent-not-connected')}
  </p>
  <Markers localiser={l} {player} {hasBadge} testId="opponent" />
  <p data-testid="opponent-hand-size">{l.t('count-hand', { n: player.hand_size })}</p>
  <p data-testid="opponent-plan">{planStatus(l, player.plan)}</p>
</section>
