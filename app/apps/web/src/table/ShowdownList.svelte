<script lang="ts">
  import { tick } from 'svelte';
  import type { Command, Seat } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { motionReduced } from '../settings/apply.js';
  import { display } from '../settings/display.svelte.js';
  import { commandLabel, logLine } from '../text.js';
  import { showdownSteps, type SequencedEvent } from './showdown.js';

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
  }

  let {
    localiser: l,
    events,
    seat,
    legal,
    onCommand,
    errorCount = 0,
    onCaughtUp,
  }: Props = $props();
  const uid = $props.id();

  const AUTO_STEP_MS = 1_200;

  type HunterCommand = Extract<Command, { hunter_spend_cross: unknown }>;

  const steps = $derived(showdownSteps(events));
  const speed = $derived(
    display.showdownSpeed === 'step'
      ? 'step'
      : motionReduced(display.reducedMotion)
        ? 'instant'
        : display.showdownSpeed,
  );
  let stepped = $state(1);
  const shown = $derived(speed === 'instant' ? steps.length : Math.min(stepped, steps.length));
  const caughtUp = $derived(shown >= steps.length);

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

  async function next(event: MouseEvent): Promise<void> {
    const focused = document.activeElement === event.currentTarget;
    stepped = shown + 1;
    if (!caughtUp) return;
    await tick();
    if (focused) onCaughtUp?.();
  }

  function send(cmd: Command): void {
    if (sent) return;
    sentFor = { legal, errorCount };
    onCommand(cmd);
  }
</script>

<section aria-labelledby="{uid}-heading" class="showdown" data-testid="showdown">
  <h2 id="{uid}-heading">{l.t('showdown-heading')}</h2>
  {#if steps.length === 0}
    <p class="note">{l.t('showdown-empty')}</p>
  {/if}
  <ol class="steps" data-testid="showdown-steps">
    {#each steps.slice(0, shown) as step, i (step[0]![0])}
      <li class:latest={i === shown - 1} data-testid="showdown-step">
        {step.map(([, event]) => logLine(l, event, seat)).join(' ')}
      </li>
    {/each}
  </ol>
  {#if speed === 'step' && !caughtUp}
    <button
      type="button"
      data-testid="showdown-next"
      data-phase-focus
      onclick={(event) => void next(event)}>{l.t('showdown-next')}</button
    >
  {/if}
  {#if caughtUp && hunter.length > 0}
    <div class="hunter" role="group" aria-labelledby="{uid}-hunter" data-testid="hunter-prompt">
      <h3 id="{uid}-hunter">{l.t('showdown-hunter-heading')}</h3>
      {#each hunter as cmd, i (cmd.hunter_spend_cross.spend)}
        <button
          type="button"
          aria-disabled={sent}
          data-testid={cmd.hunter_spend_cross.spend ? 'action-hunter-spend' : 'action-hunter-keep'}
          data-phase-focus={i === 0 ? '' : undefined}
          onclick={() => send(cmd)}>{commandLabel(l, cmd)}</button
        >
      {/each}
    </div>
  {/if}
</section>

<style>
  .showdown {
    display: grid;
    gap: 0.5rem;
  }

  h2 {
    font-size: 1.125rem;
    margin: 0;
  }

  h3 {
    font-size: 1rem;
    margin: 0;
  }

  .note {
    margin: 0;
  }

  .steps {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding-left: 1.5rem;
  }

  .steps li {
    margin: 0;
    padding: 0.25rem 0.5rem;
  }

  .steps li.latest {
    border-inline-start: 4px solid var(--accent);
    font-weight: 700;
  }

  .hunter {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.5rem;
  }

  .hunter h3 {
    flex-basis: 100%;
  }
</style>
