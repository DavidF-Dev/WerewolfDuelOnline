<script lang="ts">
  import { onMount } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import Screen from '../components/Screen.svelte';
  import { getDeviceStore } from '../device-store.js';
  import { hrefFor, replayHref } from '../router.js';
  import type { HistoryRecord } from '../storage/db.js';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();

  const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });

  let records = $state.raw<HistoryRecord[] | null>(null);

  onMount(() => {
    let active = true;
    const store = getDeviceStore();
    (store === undefined ? Promise.resolve([]) : store.history.list()).then(
      (list) => {
        if (active) records = list;
      },
      () => {
        if (active) records = [];
      },
    );
    return () => {
      active = false;
    };
  });

  const summary = (record: HistoryRecord): string =>
    l.t('history-summary', {
      result: l.t(record.winner === record.seat ? 'history-won' : 'history-lost'),
      opponent: record.opponentName ?? l.t('home-opponent-unknown'),
    });
  const meta = (record: HistoryRecord): string =>
    l.t('history-meta', {
      date: date.format(record.finishedAt),
      rounds: record.rounds,
      reason: l.t(`reason-${record.reason}`),
    });
</script>

<Screen title={l.t('history-heading')} testId="history" backLabel={l.t('back')}>
  {#if records === null}
    <!-- Nothing is shown until the stored games have been read. -->
  {:else if records.length === 0}
    <p data-testid="history-empty">{l.t('history-empty')}</p>
  {:else}
    <p><a href={hrefFor('stats')}>{l.t('history-stats-link')}</a></p>
    <ul class="games">
      {#each records as record (record.id)}
        <li>
          <span>
            <strong>{summary(record)}</strong>
            <span class="note">{meta(record)}</span>
          </span>
          <a
            href={replayHref(record.id)}
            aria-label={l.t('history-replay-label', {
              summary: summary(record),
              meta: meta(record),
            })}>{l.t('history-replay')}</a
          >
        </li>
      {/each}
    </ul>
  {/if}
</Screen>

<style>
  .games {
    display: grid;
    gap: 0.5rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .games li {
    align-items: center;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
  }

  .note {
    color: var(--muted);
    display: block;
  }
</style>
