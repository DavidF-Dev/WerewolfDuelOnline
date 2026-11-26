<script lang="ts">
  import { onMount } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import Screen from '../components/Screen.svelte';
  import { listHistory } from '../history/list.js';
  import { stats as computeStats, WIN_REASONS, type Stats } from '../history/stats.js';
  import Panel from '../kit/Panel.svelte';
  import { characterName } from '../text.js';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();
  const uid = $props.id();

  const oneDecimal = $derived(new Intl.NumberFormat(l.locale, { maximumFractionDigits: 1 }));

  let result = $state.raw<Stats | null>(null);

  onMount(() => {
    let active = true;
    void listHistory().then((records) => {
      if (active) result = computeStats(records);
    });
    return () => {
      active = false;
    };
  });
</script>

<Screen title={l.t('stats-heading')} testId="stats" back={l.t('back')}>
  {#if result === null}
    <!-- Nothing is shown until the stored games have been read. -->
  {:else if result.games === 0}
    <p data-testid="stats-empty">{l.t('stats-empty')}</p>
  {:else}
    <Panel title={l.t('stats-overall-caption')}>
      <p data-testid="stats-games">{l.t('stats-games', { n: result.games })}</p>
      <p>{l.t('stats-record', { won: result.wins, lost: result.losses })}</p>
      {#if result.averageRounds !== null}
        <p data-testid="stats-average-rounds">
          {l.t('stats-average-rounds', { n: oneDecimal.format(result.averageRounds) })}
        </p>
      {/if}
    </Panel>

    <Panel title={l.t('stats-conditions-caption')} titleId="{uid}-conditions">
      <table aria-labelledby="{uid}-conditions">
        <thead>
          <tr>
            <th scope="col">{l.t('stats-col-condition')}</th>
            <th scope="col">{l.t('stats-col-won')}</th>
            <th scope="col">{l.t('stats-col-lost')}</th>
          </tr>
        </thead>
        <tbody>
          {#each WIN_REASONS as reason (reason)}
            <tr data-testid="stats-condition-{reason}">
              <th scope="row">{l.t(`reason-${reason}`)}</th>
              <td>{result.byCondition[reason].won}</td>
              <td>{result.byCondition[reason].lost}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </Panel>

    <Panel title={l.t('stats-picks-caption')} titleId="{uid}-picks">
      <p class="note">{l.t('stats-picks-note')}</p>
      <table aria-labelledby="{uid}-picks">
        <thead>
          <tr>
            <th scope="col">{l.t('stats-col-character')}</th>
            <th scope="col">{l.t('stats-col-picked')}</th>
            <th scope="col">{l.t('stats-col-succeeded')}</th>
            <th scope="col">{l.t('stats-col-rate')}</th>
          </tr>
        </thead>
        <tbody>
          {#each result.picks as pick (pick.character)}
            <tr data-testid="stats-pick-{pick.character}">
              <th scope="row">{characterName(l, pick.character)}</th>
              <td>{pick.picked}</td>
              <td>{pick.succeeded}</td>
              <td
                >{pick.rate === null
                  ? l.t('stats-rate-none')
                  : l.t('stats-rate', { percent: Math.round(pick.rate * 100) })}</td
              >
            </tr>
          {/each}
        </tbody>
      </table>
    </Panel>

    <Panel title={l.t('stats-opponents-caption')} titleId="{uid}-opponents">
      <table aria-labelledby="{uid}-opponents">
        <thead>
          <tr>
            <th scope="col">{l.t('stats-col-opponent')}</th>
            <th scope="col">{l.t('stats-col-won')}</th>
            <th scope="col">{l.t('stats-col-lost')}</th>
          </tr>
        </thead>
        <tbody>
          {#each result.opponents as opponent (opponent.name)}
            <tr>
              <th scope="row">{opponent.name ?? l.t('home-opponent-unknown')}</th>
              <td>{opponent.won}</td>
              <td>{opponent.lost}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </Panel>
  {/if}
</Screen>

<style>
  table {
    border-collapse: collapse;
    font-size: 0.875rem;
    width: 100%;
  }

  th,
  td {
    border-bottom: 1px solid var(--line);
    padding: 0.375rem 0.25rem;
    text-align: start;
  }

  p {
    margin: 0;
  }

  .note {
    color: var(--muted);
    font-size: 0.8125rem;
    margin-bottom: 4px;
  }
</style>
