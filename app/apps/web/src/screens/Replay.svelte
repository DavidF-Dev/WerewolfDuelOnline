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
  import UnofficialNotice from '../components/UnofficialNotice.svelte';
  import { getDeviceStore } from '../device-store.js';
  import IconButton from '../kit/IconButton.svelte';
  import Label from '../kit/Label.svelte';
  import Panel from '../kit/Panel.svelte';
  import RichText from '../kit/RichText.svelte';
  import Segmented from '../kit/Segmented.svelte';
  import Sheet from '../kit/Sheet.svelte';
  import type { HistoryRecord } from '../storage/db.js';
  import MyArea from '../table/MyArea.svelte';
  import OpponentStrip from '../table/OpponentStrip.svelte';
  import PlanPanels from '../table/PlanPanels.svelte';
  import ShowdownList from '../table/ShowdownList.svelte';
  import { showdownSteps } from '../table/showdown.js';
  import { characterName, commandLabel, logParts } from '../text.js';

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

  let loadState = $state.raw<'loading' | 'missing' | 'unplayable' | Loaded>('loading');
  let index = $state(0);
  let mode = $state<Mode>('mine');
  /** Whether the showdown's earlier results are collapsed for want of room. */
  let showdownTight = $state(false);
  let menuOpen = $state(false);

  onMount(() => {
    let active = true;
    void (async () => {
      let record: HistoryRecord | undefined;
      try {
        record = await getDeviceStore()?.history.get(id);
      } catch {
        // A store that cannot be read holds no record to show.
      }
      let result: Loaded | 'missing' | 'unplayable' = 'missing';
      if (record !== undefined) {
        try {
          const steps = {
            mine: replayTimeline(record.replay, { seat: record.seat }),
            full: replayTimeline(record.replay, 'omniscient'),
          };
          const roundStarts = steps.mine.flatMap((s, i) =>
            s.events.some((event) => 'round_started' in event.kind) ? [i] : [],
          );
          result = { record, steps, roundStarts };
        } catch {
          result = 'unplayable';
        }
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

  const view = $derived(step?.view);
  const showdown = $derived(view !== undefined && view.showdown !== null);
  /** The step's events, less those the plan panels and the showdown list already show. */
  const logged = $derived.by((): Array<[number, Event]> => {
    const own = events.slice(events.length - (step?.events.length ?? 0));
    if (!showdown) return own;
    const listed = new Set(showdownSteps(events).flatMap((s) => s.map(([seq]) => seq)));
    return own.filter(([seq, event]) => !listed.has(seq) && !('plans_revealed' in event.kind));
  });
  /** Whether either hand still holds cards; once the showdown has begun, an empty pair is left out. */
  const handsHeld = $derived(
    view !== undefined && view.players.some((player) => player.hand_size > 0),
  );

  const nextRound = $derived(loaded?.roundStarts.find((start) => start > index));
  const previousRound = $derived(loaded?.roundStarts.filter((start) => start < index).at(-1));

  function go(target: number | undefined): void {
    if (target === undefined) return;
    index = Math.max(0, Math.min(last, target));
  }

  function onKeydown(event: KeyboardEvent): void {
    if (
      menuOpen ||
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

{#snippet controls()}
  {#if loaded !== null && step !== undefined}
    <section class="controls" aria-labelledby="{uid}-controls" aria-describedby="{uid}-keys">
      <h2 id="{uid}-controls" class="visually-hidden">{l.t('replay-controls')}</h2>
      <p id="{uid}-keys" class="visually-hidden">{l.t('replay-keys-hint')}</p>
      <IconButton
        icon="first"
        label={l.t('replay-previous-round')}
        data-testid="replay-previous-round"
        aria-disabled={previousRound === undefined}
        onclick={() => go(previousRound)}
      />
      <IconButton
        icon="previous"
        label={l.t('replay-previous-step')}
        data-testid="replay-previous-step"
        aria-disabled={index === 0}
        onclick={() => go(index - 1)}
      />
      <p class="position" role="status" data-testid="replay-position">
        {l.t('replay-position', { step: index + 1, total: steps.length, round: step.view.round })}
      </p>
      <IconButton
        icon="next"
        label={l.t('replay-next-step')}
        data-testid="replay-next-step"
        aria-disabled={index === last}
        onclick={() => go(index + 1)}
      />
      <IconButton
        icon="last"
        label={l.t('replay-next-round')}
        data-testid="replay-next-round"
        aria-disabled={nextRound === undefined}
        onclick={() => go(nextRound)}
      />
    </section>
  {/if}
{/snippet}

{#snippet menuButton()}
  <IconButton
    icon="menu"
    label={l.t('replay-menu')}
    aria-haspopup="dialog"
    data-testid="replay-menu-toggle"
    onclick={() => (menuOpen = true)}
  />
{/snippet}

{#snippet hands(compact: boolean)}
  {#if view !== undefined}
    <Panel tight role="group" aria-label={l.t('replay-hands-heading')}>
      {#each [opponentSeat, seat] as s (s)}
        {@const player = playerOf(view.players, s)}
        <div class={['hand', { compact }]} data-testid="replay-hand-{s}">
          <Label as="span">{names[s]}</Label>
          {#if player.hand === null}
            <p>{l.t('replay-hand-hidden', { n: player.hand_size })}</p>
          {:else if player.hand.length === 0}
            <p>{l.t('replay-hand-empty')}</p>
          {:else}
            <ul
              class="cards"
              aria-label={s === seat
                ? l.t('my-hand-heading')
                : l.t('replay-hand-of', { name: names[s] })}
            >
              {#each player.hand as c (c)}
                <li>
                  {#if compact}
                    <strong>{characterName(l, c)}</strong>
                  {:else}
                    <CharacterCard localiser={l} character={c} size="target" />
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
    </Panel>
  {/if}
{/snippet}

<Screen
  title={l.t('replay-heading')}
  testId="replay"
  back={l.t('back')}
  fit
  tight
  footer={loaded !== null && step !== undefined ? controls : undefined}
  right={menuButton}
>
  {#if menuOpen}
    <Sheet
      title={l.t('replay-menu')}
      closeLabel={l.t('sheet-close')}
      onclose={() => (menuOpen = false)}
      testId="replay-menu"
    >
      <UnofficialNotice localiser={l} placement="inline" />
    </Sheet>
  {/if}
  {#if loadState === 'missing'}
    <p data-testid="replay-missing">{l.t('replay-missing')}</p>
  {:else if loadState === 'unplayable'}
    <p data-testid="replay-unplayable">{l.t('replay-unplayable')}</p>
  {:else if loaded !== null && step !== undefined && view !== undefined}
    <Segmented
      label={l.t('replay-view-group')}
      stretch
      value={mode}
      options={[
        { value: 'mine', label: l.t('replay-view-mine'), testId: 'replay-view-mine' },
        { value: 'full', label: l.t('replay-view-full'), testId: 'replay-view-full' },
      ]}
      onchange={(value) => (mode = value)}
    />

    <OpponentStrip
      localiser={l}
      name={names[opponentSeat]}
      player={playerOf(view.players, opponentSeat)}
      hasBadge={view.badge === opponentSeat}
      animate
    />

    <div class="middle" data-testid="phase-panels">
      {#if showdown}
        <PlanPanels localiser={l} {view} {events} {seat} compact={showdownTight} />
        {#key `${mode}|${index}`}
          <ShowdownList
            localiser={l}
            {events}
            {seat}
            legal={[]}
            onCommand={() => {}}
            instant
            onTight={(tight) => (showdownTight = tight)}
          />
        {/key}
        {#if handsHeld}
          {@render hands(true)}
        {/if}
      {:else}
        {@render hands(false)}
      {/if}
    </div>

    <MyArea localiser={l} name={names[seat]} {view} {seat} animate />

    <!-- Only the log scrolls, inside its panel, when a step does not fit beside the table. -->
    <div class="log-slot">
      <Panel tight>
        <Label as="h2" id="{uid}-log">{l.t('replay-log-heading')}</Label>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          class="entries"
          role="region"
          aria-labelledby="{uid}-log"
          tabindex="0"
          data-testid="replay-log-area"
        >
          {#if step.command !== null && step.seat !== null}
            <p data-testid="replay-command">
              {l.t('replay-command', {
                who: names[step.seat],
                command: commandLabel(l, step.command),
              })}
            </p>
          {/if}
          <div data-testid="replay-log">
            {#if step.events.length === 0}
              <p>{l.t('replay-log-empty')}</p>
            {:else if logged.length > 0}
              <ol class="log">
                {#each logged as [seq, event] (seq)}
                  <li><RichText parts={logParts(l, event, seat)} /></li>
                {/each}
              </ol>
            {:else if step.command === null}
              <p>{l.t('replay-log-above')}</p>
            {/if}
          </div>
        </div>
      </Panel>
    </div>
  {/if}
</Screen>

<style>
  .middle {
    display: flex;
    flex: 1 0 auto;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
  }

  p {
    margin: 0;
  }

  .controls {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
  }

  .position {
    flex: 1 1 auto;
    font-size: 0.8125rem;
    text-align: center;
  }

  .hand {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    font-size: 0.8125rem;
    gap: 2px 8px;
  }

  .hand + .hand {
    margin-top: 6px;
  }

  .hand :global(.label) {
    flex: 0 0 100%;
    margin: 0;
  }

  .cards {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .cards li {
    margin: 0;
  }

  .compact :global(.label) {
    flex: none;
  }

  .compact .cards {
    gap: 0 0.5em;
  }

  .log-slot {
    display: flex;
    flex: 0 1 auto;
    flex-direction: column;
    min-height: 4rem;
  }

  .log-slot > :global(.panel) {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
  }

  .entries {
    min-height: 0;
    overflow-y: auto;
    font-size: 0.8125rem;
  }

  .log {
    list-style: none;
    margin: 0;
    padding: 0;
  }
</style>
