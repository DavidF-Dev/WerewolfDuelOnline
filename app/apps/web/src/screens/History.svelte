<script lang="ts">
  import { onMount } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import Button from '../components/Button.svelte';
  import Screen from '../components/Screen.svelte';
  import HistoryGame from '../history/HistoryGame.svelte';
  import HistoryTotals from '../history/HistoryTotals.svelte';
  import { listHistory } from '../history/list.js';
  import Panel from '../kit/Panel.svelte';
  import { hrefFor } from '../router.js';
  import type { HistoryRecord } from '../storage/db.js';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();

  let records = $state.raw<HistoryRecord[] | null>(null);

  onMount(() => {
    let active = true;
    void listHistory().then((list) => {
      if (active) records = list;
    });
    return () => {
      active = false;
    };
  });
</script>

<Screen title={l.t('history-heading')} testId="history" back={l.t('back')}>
  {#if records === null}
    <!-- Nothing is shown until the stored games have been read. -->
  {:else if records.length === 0}
    <p data-testid="history-empty">{l.t('history-empty')}</p>
  {:else}
    <div class="more">
      <Button size="small" href={hrefFor('stats')}>{l.t('history-stats-link')}</Button>
    </div>
    <Panel>
      <HistoryTotals localiser={l} {records} />
      <ul class="games">
        {#each records as record (record.id)}
          <HistoryGame localiser={l} {record} />
        {/each}
      </ul>
    </Panel>
  {/if}
</Screen>

<style>
  .games {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .more {
    display: flex;
    justify-content: flex-end;
  }
</style>
