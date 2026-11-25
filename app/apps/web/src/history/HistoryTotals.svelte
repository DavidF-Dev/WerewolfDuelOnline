<script lang="ts">
  import type { WinReason } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import type { HistoryRecord } from '../storage/db.js';
  import { totals } from './stats.js';

  interface Props {
    localiser: Localiser;
    records: readonly HistoryRecord[];
  }

  let { localiser: l, records }: Props = $props();

  const REASONS: readonly WinReason[] = ['health', 'fangs', 'crosses'];
  const counted = $derived(totals(records));
</script>

<div class="totals" data-testid="history-totals">
  <dl class="group">
    <div>
      <dt>{l.t('history-played')}</dt>
      <dd>{counted.games}</dd>
    </div>
    <div>
      <dt>{l.t('history-won')}</dt>
      <dd>{counted.wins}</dd>
    </div>
  </dl>
  <dl class="group by">
    {#each REASONS as reason (reason)}
      <div>
        <dt>
          <span class="visually-hidden"
            >{l.t('history-won-by', { reason: l.t(`reason-${reason}`) })}</span
          ><span aria-hidden="true">{l.t(`reason-${reason}`)}</span>
        </dt>
        <dd>{counted.winsBy[reason]}</dd>
      </div>
    {/each}
  </dl>
</div>

<style>
  .totals {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    font-size: 0.75rem;
    gap: 2px 16px;
    margin: 0 0 6px;
  }

  .group {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 16px;
    margin: 0;
  }

  .by {
    gap: 2px 0.25em;
    margin-inline-start: auto;
  }

  .group div {
    display: flex;
    gap: 0.25em;
  }

  .by div + div::before {
    color: var(--muted);
    content: '·' / '';
  }

  dt,
  dd {
    margin: 0;
  }

  dd {
    font-weight: 700;
  }
</style>
