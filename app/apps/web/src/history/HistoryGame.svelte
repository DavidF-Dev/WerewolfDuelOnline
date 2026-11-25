<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import Button from '../components/Button.svelte';
  import ListRow from '../kit/ListRow.svelte';
  import { replayHref } from '../router.js';
  import type { HistoryRecord } from '../storage/db.js';

  interface Props {
    localiser: Localiser;
    record: HistoryRecord;
  }

  let { localiser: l, record }: Props = $props();

  const date = $derived(new Intl.DateTimeFormat(l.locale, { dateStyle: 'medium' }));
  const result = $derived(l.t(record.winner === record.seat ? 'history-won' : 'history-lost'));
  const opponent = $derived(record.opponentName ?? l.t('home-opponent-unknown'));
  const facts = $derived({
    date: date.format(record.finishedAt),
    rounds: record.rounds,
    reason: l.t(`reason-${record.reason}`),
  });
  const label = $derived(
    l.t('history-replay-label', {
      summary: l.t('history-summary', { result, opponent }),
      meta: l.t('history-meta', facts),
    }),
  );
</script>

<ListRow data-testid="history-game">
  <p class="title">
    <strong class="result">{result}</strong>{` ${l.t('reveal-versus')} ${opponent}`}
  </p>
  <p class="meta" data-testid="history-meta">{l.t('history-row-meta', facts)}</p>
  {#snippet end()}
    <Button size="small" href={replayHref(record.id)} aria-label={label}
      >{l.t('history-replay')}</Button
    >
  {/snippet}
</ListRow>

<style>
  p {
    margin: 0;
  }

  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    color: var(--muted);
    font-size: 0.75rem;
  }
</style>
