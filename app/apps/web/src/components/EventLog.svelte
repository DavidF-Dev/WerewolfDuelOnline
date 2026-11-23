<script lang="ts">
  import type { Event, Seat } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { logLine } from '../text.js';

  interface Props {
    localiser: Localiser;
    events: Array<[number, Event]>;
    seat: Seat | null;
  }

  let { localiser: l, events, seat }: Props = $props();
  const uid = $props.id();
</script>

<section aria-labelledby="{uid}-heading" data-testid="event-log">
  <h2 id="{uid}-heading">{l.t('log-heading')}</h2>
  <ul aria-live="polite" aria-relevant="additions">
    {#each events as [seq, event] (seq)}
      <li data-testid="log-{seq}">{logLine(l, event, seat)}</li>
    {/each}
  </ul>
</section>
