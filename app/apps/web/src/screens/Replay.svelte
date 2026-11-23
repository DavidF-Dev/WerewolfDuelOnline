<script lang="ts">
  import { onMount } from 'svelte';
  import {
    replayTimeline,
    type Event,
    type PlayerView,
    type Seat,
    type TimelineStep,
  } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import CharacterCard from '../components/CharacterCard.svelte';
  import Screen from '../components/Screen.svelte';
  import { getDeviceStore } from '../device-store.js';
  import type { HistoryRecord } from '../storage/db.js';
  import MarkerList from '../table/MarkerList.svelte';
  import TableArea from '../table/TableArea.svelte';
  import { commandLabel, logLine } from '../text.js';

  interface Props {
    localiser: Localiser;
    /** The history record to replay. */
    id: string;
  }

  type Mode = 'mine' | 'full';

  interface Loaded {
    record: HistoryRecord;
    steps: Record<Mode, TimelineStep[]>;
    /** The indices of the steps at which a round begins. */
    roundStarts: number[];
  }

  let { localiser: l, id }: Props = $props();
  const uid = $props.id();

  let loadState = $state.raw<'loading' | 'missing' | Loaded>('loading');
  let index = $state(0);
  let mode = $state<Mode>('mine');

  onMount(() => {
    let active = true;
    void (async () => {
      let result: Loaded | 'missing' = 'missing';
      try {
        const record = await getDeviceStore()?.history.get(id);
        if (record !== undefined) {
          const steps = {
            mine: replayTimeline(record.replay, { seat: record.seat }),
            full: replayTimeline(record.replay, 'omniscient'),
          };
          const roundStarts = steps.mine.flatMap((s, i) =>
            s.events.some((event) => 'round_started' in event.kind) ? [i] : [],
          );
          result = { record, steps, roundStarts };
        }
      } catch {
        // A record that cannot be played is treated as missing.
      }
      if (active) loadState = result;
    })();
    return () => {
      active = false;
    };
  });

  const loaded = $derived(typeof loadState === 'object' ? loadState : null);
  const steps = $derived(loaded?.steps[mode] ?? []);
  const step = $derived(steps[Math.min(index, steps.length - 1)]);
  const last = $derived(steps.length - 1);

  /** Every event up to and including this step, numbered as a log. */
  const events = $derived.by((): Array<[number, Event]> =>
    steps
      .slice(0, index + 1)
      .flatMap((s) => s.events)
      .map((event, seq) => [seq, event]),
  );

  const seat = $derived<Seat>(loaded?.record.seat ?? 'p0');
  const opponentSeat = $derived<Seat>(seat === 'p0' ? 'p1' : 'p0');
  const names = $derived.by((): Record<Seat, string> => {
    const opponent = loaded?.record.opponentName ?? l.t(`seat-${opponentSeat}`);
    return {
      p0: seat === 'p0' ? l.t('table-you') : opponent,
      p1: seat === 'p1' ? l.t('table-you') : opponent,
    };
  });

  const nextRound = $derived(loaded?.roundStarts.find((start) => start > index));
  const previousRound = $derived(loaded?.roundStarts.filter((start) => start < index).at(-1));

  function go(target: number | undefined): void {
    if (target === undefined) return;
    index = Math.max(0, Math.min(last, target));
  }

  function onKeydown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (event.key === 'ArrowRight') go(index + 1);
    else if (event.key === 'ArrowLeft') go(index - 1);
    else return;
    event.preventDefault();
  }

  const playerOf = (players: [PlayerView, PlayerView], s: Seat): PlayerView =>
    players[s === 'p0' ? 0 : 1];
</script>

<svelte:window onkeydown={onKeydown} />

<Screen title={l.t('replay-heading')} testId="replay" backLabel={l.t('back')}>
  {#if loadState === 'missing'}
    <p data-testid="replay-missing">{l.t('replay-missing')}</p>
  {:else if loaded !== null && step !== undefined}
    <section aria-labelledby="{uid}-controls">
      <h2 id="{uid}-controls">{l.t('replay-controls')}</h2>
      <p role="status" data-testid="replay-position">
        {l.t('replay-position', { step: index + 1, total: steps.length, round: step.view.round })}
      </p>
      <p class="note">{l.t('replay-keys-hint')}</p>
      <div class="row">
        <button
          type="button"
          aria-disabled={previousRound === undefined}
          onclick={() => go(previousRound)}>{l.t('replay-previous-round')}</button
        >
        <button type="button" aria-disabled={index === 0} onclick={() => go(index - 1)}
          >{l.t('replay-previous-step')}</button
        >
        <button type="button" aria-disabled={index === last} onclick={() => go(index + 1)}
          >{l.t('replay-next-step')}</button
        >
        <button type="button" aria-disabled={nextRound === undefined} onclick={() => go(nextRound)}
          >{l.t('replay-next-round')}</button
        >
      </div>
      <div class="row" role="group" aria-label={l.t('replay-view-group')}>
        <button type="button" aria-pressed={mode === 'mine'} onclick={() => (mode = 'mine')}
          >{l.t('replay-view-mine')}</button
        >
        <button type="button" aria-pressed={mode === 'full'} onclick={() => (mode = 'full')}
          >{l.t('replay-view-full')}</button
        >
      </div>
    </section>

    <TableArea localiser={l} view={step.view} {seat} {events} {names} />

    {#each [opponentSeat, seat] as s (s)}
      {@const player = playerOf(step.view.players, s)}
      <section class="player" aria-labelledby="{uid}-{s}" data-testid="replay-player-{s}">
        <h2 id="{uid}-{s}">{l.t('replay-player-heading', { name: names[s] })}</h2>
        <MarkerList localiser={l} {player} hasBadge={step.view.badge === s} testId="replay-{s}" />
        <div data-testid="replay-hand-{s}">
          {#if player.hand === null}
            <p>{l.t('replay-hand-hidden', { n: player.hand_size })}</p>
          {:else if player.hand.length === 0}
            <p>{l.t('replay-hand-empty')}</p>
          {:else}
            <ul class="cards" aria-label={l.t('replay-hand-heading')}>
              {#each player.hand as c (c)}
                <li><CharacterCard localiser={l} character={c} /></li>
              {/each}
            </ul>
          {/if}
        </div>
      </section>
    {/each}

    <section aria-labelledby="{uid}-log">
      <h2 id="{uid}-log">{l.t('replay-log-heading')}</h2>
      {#if step.command !== null && step.seat !== null}
        <p data-testid="replay-command">
          {l.t('replay-command', { who: names[step.seat], command: commandLabel(l, step.command) })}
        </p>
      {/if}
      <div data-testid="replay-log">
        {#if step.events.length === 0}
          <p>{l.t('replay-log-empty')}</p>
        {:else}
          <ol class="log">
            {#each step.events as event, i (i)}
              <li>{logLine(l, event, seat)}</li>
            {/each}
          </ol>
        {/if}
      </div>
    </section>
  {/if}
</Screen>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-block: 0.5rem;
  }

  .note {
    color: var(--muted);
    margin: 0;
  }

  button[aria-pressed='true'] {
    background: var(--surface-2);
    border-width: 2px;
    font-weight: 700;
  }

  .player {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    display: grid;
    gap: 0.5rem;
    margin-block: 0.75rem;
    padding: 0.75rem;
  }

  h2 {
    font-size: 1.125rem;
    margin: 0;
  }

  p {
    margin: 0;
  }

  .cards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .log {
    padding-left: 1.5rem;
  }
</style>
