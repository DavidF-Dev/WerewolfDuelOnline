<script lang="ts">
  import { untrack } from 'svelte';
  import type { Event, EventKind, Seat, Tiebreak } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { CHARACTERS, initiative } from '../cards.js';
  import { characterLabel, logLine } from '../text.js';

  interface Props {
    localiser: Localiser;
    events: Array<[number, Event]>;
    seat: Seat;
    /** The room's tiebreak rule; null until the referee has said which. */
    tiebreak: Tiebreak | null;
  }

  let { localiser: l, events, seat, tiebreak }: Props = $props();
  const uid = $props.id();

  /** How many recent announcements stay in the live log. */
  const ANNOUNCED = 8;

  // Events already held when the table opened are in the log but are not read out.
  const openedAt = untrack(() => events.at(-1)?.[0] ?? -1);

  /** The seat whose own command produced this event, if any. */
  function actor(kind: EventKind): Seat | null {
    if ('plan_submitted' in kind) return kind.plan_submitted.seat;
    if ('hourglasses_placed' in kind) return kind.hourglasses_placed.seat;
    if ('potion_target_chosen' in kind) return kind.potion_target_chosen.seat;
    if ('next_round_requested' in kind) return kind.next_round_requested.seat;
    if ('resigned' in kind) return kind.resigned.seat;
    return null;
  }

  const announcements = $derived(
    events.filter(([seq, event]) => seq > openedAt && actor(event.kind) !== seat).slice(-ANNOUNCED),
  );
</script>

<div class="visually-hidden" role="log" aria-live="polite" aria-label={l.t('announcer-label')}>
  {#each announcements as [seq, event] (seq)}
    <p>{logLine(l, event, seat)}</p>
  {/each}
</div>

<details class="drawer" data-testid="log-drawer">
  <summary>{l.t('drawer-summary')}</summary>
  <section aria-labelledby="{uid}-log" data-testid="event-log">
    <h2 id="{uid}-log">{l.t('log-heading')}</h2>
    <ol class="log">
      {#each events as [seq, event] (seq)}
        <li data-testid="log-{seq}">{logLine(l, event, seat)}</li>
      {/each}
    </ol>
  </section>
  <section aria-labelledby="{uid}-rules">
    <h2 id="{uid}-rules">{l.t('rules-heading')}</h2>
    <p data-testid="rules-order">
      {l.t('rules-order')}
      {#if tiebreak !== null}
        {l.t(`rules-tiebreak-${tiebreak.replaceAll('_', '-')}`)}
      {/if}
    </p>
    <ul>
      {#each CHARACTERS as c (c)}
        <li>{characterLabel(l, c, initiative(c))}</li>
      {/each}
      <li>{l.t('card-fool-name', { ability: l.t('card-ability-fool') })}</li>
    </ul>
  </section>
</details>

<style>
  .drawer {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 0 0.75rem;
  }

  summary {
    cursor: pointer;
    font-weight: 700;
    padding-block: 0.625rem;
  }

  h2 {
    font-size: 1.125rem;
  }

  .log {
    padding-left: 1.5rem;
  }
</style>
