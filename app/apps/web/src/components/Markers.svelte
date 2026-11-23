<script lang="ts">
  import type { PlayerView } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { markerLines } from '../text.js';

  interface Props {
    localiser: Localiser;
    player: PlayerView;
    hasBadge: boolean;
    /** Prefix for this list's test id. */
    testId: string;
  }

  let { localiser: l, player, hasBadge, testId }: Props = $props();
</script>

<ul data-testid="{testId}-markers">
  {#each markerLines(l, player, hasBadge) as line (line)}
    <li>{line}</li>
  {/each}
</ul>
