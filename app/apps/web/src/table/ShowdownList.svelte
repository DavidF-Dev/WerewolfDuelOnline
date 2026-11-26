<script lang="ts">
  import { tick } from 'svelte';
  import type { Command, Seat } from '@wwd/engine';
  import { richMessage, type Localiser, type RichPart } from '@wwd/client-core';
  import { motionReduced } from '../settings/apply.js';
  import { display } from '../settings/display.svelte.js';
  import Label from '../kit/Label.svelte';
  import Panel from '../kit/Panel.svelte';
  import RichText from '../kit/RichText.svelte';
  import MarkerIcon from '../components/MarkerIcon.svelte';
  import { commandLabel, logParts } from '../text.js';
  import Button from '../components/Button.svelte';
  import RoundSummary from './RoundSummary.svelte';
  import { handPrimary } from './primary.svelte.js';
  import { roundReveal, showdownSteps, type SequencedEvent } from './showdown.js';

  interface Props {
    localiser: Localiser;
    events: SequencedEvent[];
    seat: Seat;
    legal: Command[];
    onCommand: (cmd: Command) => void;
    /** Changes whenever the referee reports a problem, which frees a sent command for a retry. */
    errorCount?: number;
    /** Called when the last result is stepped to while the Next button has focus. */
    onCaughtUp?: () => void;
    /** Shows every result at once, whatever the showdown speed. */
    instant?: boolean;
    /** Told whether every result is shown, whenever that changes. */
    onShown?: (all: boolean) => void;
    /** Told whether the earlier results are collapsed for want of room, whenever that changes. */
    onTight?: (tight: boolean) => void;
  }

  let {
    localiser: l,
    events,
    seat,
    legal,
    onCommand,
    errorCount = 0,
    onCaughtUp,
    instant = false,
    onShown,
    onTight,
  }: Props = $props();
  const uid = $props.id();

  const AUTO_STEP_MS = 1_200;

  type HunterCommand = Extract<Command, { hunter_spend_cross: unknown }>;

  const index = (s: Seat): 0 | 1 => (s === 'p0' ? 0 : 1);

  const steps = $derived(showdownSteps(events));
  const reveal = $derived(roundReveal(events));
  const speed = $derived(
    instant
      ? 'instant'
      : display.showdownSpeed === 'step'
        ? 'step'
        : motionReduced(display.reducedMotion)
          ? 'instant'
          : display.showdownSpeed,
  );
  let stepped = $state(1);
  const shown = $derived(speed === 'instant' ? steps.length : Math.min(stepped, steps.length));
  const caughtUp = $derived(shown >= steps.length);
  $effect.pre(() => {
    onShown?.(caughtUp);
  });

  /** The round that the last shown step ends, which the round summary closes in place of a line. */
  const endedRound = $derived.by((): number | null => {
    const kind = steps[shown - 1]?.[0]?.[1].kind;
    return kind !== undefined && 'round_ended' in kind ? kind.round_ended.round : null;
  });

  interface Item {
    key: string;
    parts: RichPart[];
    /** What the step's badge shows: an initiative, the Potion, or nothing. */
    badge: number | 'potion' | null;
    out: boolean;
  }

  /** The seats eliminated before they could act, with the step after which each would have acted. */
  const eliminated = $derived.by((): Array<{ seat: Seat; after: number }> => {
    if (reveal === null) return [];
    const hit = (step: SequencedEvent[]): Seat[] =>
      step.flatMap(([, event]) => {
        const kind = event.kind;
        if ('attack_hit' in kind) return [kind.attack_hit.target_seat];
        if ('potion_resolved' in kind && kind.potion_resolved.hit) {
          return [kind.potion_resolved.victim];
        }
        return [];
      });
    const resolvedAt = (s: Seat): number =>
      steps.findIndex((step) => {
        const kind = step[0]?.[1].kind;
        return (
          kind !== undefined && 'character_resolved' in kind && kind.character_resolved.seat === s
        );
      });
    return steps.flatMap((step, i) =>
      hit(step).map((s) => {
        const first = reveal.order[0];
        // The second seat acts after the first one; the first acts straight after the Potion.
        const slot = s === first ? -1 : resolvedAt(first);
        return { seat: s, after: slot >= 0 ? Math.max(slot, i) : i };
      }),
    );
  });

  function outParts(s: Seat): RichPart[] {
    if (reveal === null) return [];
    const character = reveal.plans[index(s)].character;
    const mine = s === seat;
    return richMessage(
      l,
      mine ? 'showdown-out-yours' : 'showdown-out-opponent',
      { owner: l.t(mine ? 'player-your-cap' : 'player-opponent-cap'), character },
      { owner: 'player', character: 'character' },
    );
  }

  function badgeOf(step: SequencedEvent[]): number | 'potion' | null {
    const kind = step[0]?.[1].kind;
    if (kind === undefined) return null;
    if ('potion_resolved' in kind) return 'potion';
    if ('character_resolved' in kind && reveal !== null) {
      return reveal.effective[index(kind.character_resolved.seat)];
    }
    return null;
  }

  /** The shown results as list items, each elimination after the step where it would have acted. */
  const items = $derived.by((): Item[] => {
    const listed = endedRound === null ? shown : shown - 1;
    return steps.slice(0, listed).flatMap((step, i): Item[] => [
      {
        key: `step-${step[0]![0]}`,
        parts: step.flatMap(([, event], j) => [
          ...(j > 0 ? [{ text: ' ' }] : []),
          ...logParts(l, event, seat),
        ]),
        badge: badgeOf(step),
        out: false,
      },
      ...eliminated
        .filter((e) => e.after === i)
        .map((e) => ({
          key: `out-${e.seat}`,
          parts: outParts(e.seat),
          badge: reveal?.effective[index(e.seat)] ?? null,
          out: true,
        })),
    ]);
  });
  // Once the round has ended, its summary is the latest result and every line before it is done.
  const now = $derived(
    endedRound === null ? items.findLastIndex((item) => !item.out) : items.length,
  );

  const hunter = $derived(
    legal.filter(
      (cmd): cmd is HunterCommand => typeof cmd === 'object' && 'hunter_spend_cross' in cmd,
    ),
  );

  let sentFor = $state.raw<{ legal: Command[]; errorCount: number } | null>(null);
  const sent = $derived(sentFor?.legal === legal && sentFor.errorCount === errorCount);

  $effect(() => {
    if (speed !== 'auto' || caughtUp) return;
    const timer = setInterval(() => (stepped += 1), AUTO_STEP_MS);
    return () => clearInterval(timer);
  });

  // Once the screen runs out of room, the earlier steps stay one line each for the rest of the round.
  let root = $state<HTMLElement>();
  let tight = $state(false);
  $effect(() => onTight?.(tight));
  $effect(() => {
    void items.length;
    void endedRound;
    void hunter.length;
    const body = root?.closest('main');
    if (body === null || body === undefined || tight) return;
    const check = (): void => {
      if (body.scrollHeight > body.clientHeight + 1) tight = true;
    };
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(check);
    // The body keeps its size as its content grows, so the parts inside it are watched too.
    for (const part of [body, ...Array.from(body.children)]) watch.observe(part);
    return () => watch.disconnect();
  });

  async function next(event: MouseEvent): Promise<void> {
    const focused = document.activeElement === event.currentTarget;
    stepped = shown + 1;
    if (!caughtUp) return;
    await tick();
    if (focused) onCaughtUp?.();
  }

  const hosted = handPrimary(
    () => nextButton,
    () => speed === 'step' && !caughtUp,
  );

  function send(cmd: Command): void {
    if (sent) return;
    sentFor = { legal, errorCount };
    onCommand(cmd);
  }
</script>

{#snippet nextButton()}
  <Button
    data-testid="showdown-next"
    fit
    data-phase-focus
    onclick={(event: MouseEvent) => void next(event)}>{l.t('showdown-next')}</Button
  >
{/snippet}

<section bind:this={root} aria-labelledby="{uid}-heading" class="showdown" data-testid="showdown">
  <h2 id="{uid}-heading" class="visually-hidden">{l.t('showdown-heading')}</h2>
  {#if steps.length === 0}
    <p class="note">{l.t('showdown-empty')}</p>
  {/if}
  <ol class="steps" data-testid="showdown-steps">
    {#each items as item, i (item.key)}
      <li
        class={{ done: !item.out && i < now, now: i === now, out: item.out }}
        class:collapsed={tight && i < now}
        data-testid={item.out ? 'showdown-out' : 'showdown-step'}
      >
        <span class="badge" aria-hidden="true"
          >{#if item.badge === 'potion'}<MarkerIcon
              marker="potion"
            />{:else if item.badge !== null}{item.badge}{/if}</span
        >
        <span class="text"><RichText parts={item.parts} /></span>
      </li>
    {/each}
  </ol>
  {#if speed === 'step' && !caughtUp && !hosted}
    {@render nextButton()}
  {/if}
  {#if caughtUp && hunter.length > 0}
    <Panel tight role="group" aria-labelledby="{uid}-hunter" data-testid="hunter-prompt">
      <Label as="h3" id="{uid}-hunter">{l.t('showdown-hunter-heading')}</Label>
      <div class="choices">
        {#each hunter as cmd, i (cmd.hunter_spend_cross.spend)}
          <Button
            aria-disabled={sent}
            data-testid={cmd.hunter_spend_cross.spend
              ? 'action-hunter-spend'
              : 'action-hunter-keep'}
            data-phase-focus={i === 0 ? '' : undefined}
            onclick={() => send(cmd)}>{commandLabel(l, cmd)}</Button
          >
        {/each}
      </div>
    </Panel>
  {/if}
  {#if endedRound !== null}
    <RoundSummary localiser={l} {events} {seat} round={endedRound} latest compact={tight} />
  {/if}
</section>

<style>
  .showdown {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 6px;
  }

  .note {
    margin: 0;
  }

  .steps {
    display: grid;
    gap: 5px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .steps li {
    align-items: flex-start;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    display: flex;
    font-size: 0.8125rem;
    gap: 8px;
    line-height: 1.35;
    margin: 0;
    min-width: 0;
    padding: 6px 8px;
  }

  .badge {
    align-items: center;
    background: var(--chip);
    border-radius: 999px;
    display: inline-flex;
    flex: none;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    line-height: 1;
    height: 1.375rem;
    justify-content: center;
    width: 1.375rem;
  }

  .badge:empty {
    visibility: hidden;
  }

  .text {
    min-width: 0;
  }

  /* Dimmed with the muted ink, which keeps its contrast in every theme, not with opacity. */
  .steps li.done,
  .steps li.out {
    color: var(--muted);
  }

  .steps li.now {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .steps li.out .text {
    text-decoration: line-through;
  }

  .steps li.collapsed .text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A marker's word stays; its icon would show through the ellipsis. */
  .steps li.collapsed .text :global([data-part='icon']) {
    display: none;
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .choices :global(.button) {
    flex: 1 1 auto;
    width: auto;
  }

  @media (forced-colors: active) {
    .steps li.now {
      outline: 2px solid CanvasText;
    }
  }
</style>
