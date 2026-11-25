<script lang="ts">
  import { untrack } from 'svelte';
  import type { Event, EventKind, Seat, Tiebreak } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { CHARACTERS, initiative } from '../cards.js';
  import AbilityLegend from '../components/AbilityLegend.svelte';
  import Label from '../kit/Label.svelte';
  import RichText from '../kit/RichText.svelte';
  import Sheet from '../kit/Sheet.svelte';
  import { display } from '../settings/display.svelte.js';
  import { abilityText, characterLabel, logLine, logParts } from '../text.js';

  interface Props {
    localiser: Localiser;
    events: Array<[number, Event]>;
    seat: Seat;
    /** The room's tiebreak rule; null until the referee has said which. */
    tiebreak: Tiebreak | null;
    /** Whether the log and rules sheet is shown. */
    open: boolean;
    /** Closes the sheet. */
    onclose: () => void;
  }

  let { localiser: l, events, seat, tiebreak, open, onclose }: Props = $props();
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

{#if open}
  <Sheet
    title={l.t('drawer-summary')}
    closeLabel={l.t('sheet-close')}
    {onclose}
    testId="log-drawer"
  >
    <section aria-labelledby="{uid}-log" data-testid="event-log">
      <Label as="h3" id="{uid}-log">{l.t('log-heading')}</Label>
      <ol class="log">
        {#each events as [seq, event] (seq)}
          <li data-testid="log-{seq}"><RichText parts={logParts(l, event, seat)} /></li>
        {/each}
      </ol>
    </section>
    <section aria-labelledby="{uid}-rules">
      <Label as="h3" id="{uid}-rules">{l.t('rules-heading')}</Label>
      <p data-testid="rules-order">
        {l.t('rules-order')}
        {#if tiebreak !== null}
          {l.t(`rules-tiebreak-${tiebreak.replaceAll('_', '-')}`)}
        {/if}
      </p>
      {#if display.rulesHints}
        <p data-testid="rules-plan-hint">{l.t('hint-plan')}</p>
      {/if}
      <ul>
        {#each CHARACTERS as c (c)}
          <li>{characterLabel(l, c, initiative(c))}</li>
        {/each}
        <li>{l.t('card-fool-name', { ability: abilityText(l, 'fool') })}</li>
      </ul>
    </section>
    <AbilityLegend localiser={l} />
  </Sheet>
{/if}

<style>
  p,
  ul,
  ol {
    margin: 0 0 0.5rem;
  }

  .log,
  ul {
    padding-left: 1.25rem;
  }
</style>
