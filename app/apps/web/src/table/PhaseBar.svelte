<script lang="ts" module>
  import type { View } from '@wwd/engine';

  /** How many of the four steps (Plan, Reveal, Potion or Showdown, Round over) a phase has reached, and its name. */
  export function phaseStep(view: View): { reached: 1 | 2 | 3 | 4; id: string } {
    const phase = view.phase;
    if (phase === 'plan') return { reached: 1, id: 'phase-step-plan' };
    if (phase === 'round_over') return { reached: 4, id: 'phase-step-round-over' };
    if ('reveal_hourglass' in phase) return { reached: 2, id: 'phase-step-reveal' };
    if ('reveal_potion' in phase) return { reached: 3, id: 'phase-step-potion' };
    // The phase bar shows a finished game only while its final showdown is stepped through.
    return { reached: 3, id: 'phase-step-showdown' };
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Command } from '@wwd/engine';
  import type { GameClientState, Localiser } from '@wwd/client-core';
  import Button from '../components/Button.svelte';
  import PhaseActions from '../components/PhaseActions.svelte';
  import RichText from '../kit/RichText.svelte';
  import { instructionText } from '../text.js';
  import type { Coach } from '../tutorial/coach.js';
  import type { HostedAction } from './primary.svelte.js';
  import { tableSettings } from './table-settings.js';

  interface Props {
    localiser: Localiser;
    state: GameClientState;
    view: View;
    onCommand: (cmd: Command) => void;
    /** The primary actions the phase panels hand to the bar. */
    hosted?: readonly HostedAction[];
    /** An instruction a phase panel hands to the bar, shown in place of the phase's own. */
    hostedInstruction?: Snippet | null;
    /** The coach, whose step and text take the place of the phase's own. */
    coach?: Coach | null;
    /** Whether the coach's button takes the place of the actions offered now. */
    coachButton?: boolean;
  }

  let {
    localiser: l,
    state,
    view,
    onCommand,
    hosted = [],
    hostedInstruction = null,
    coach = null,
    coachButton = false,
  }: Props = $props();

  const STEPS = [1, 2, 3, 4] as const;
  const settings = tableSettings();
  const step = $derived(phaseStep(view));
  const steps = $derived(
    coach === null ? STEPS : Array.from({ length: coach.count }, (_, i) => i + 1),
  );
  const reached = $derived(coach === null ? step.reached : coach.step);
  const stepLabel = $derived(
    coach === null
      ? l.t(step.id)
      : l.t('tutorial-progress', { step: coach.step, count: coach.count, title: coach.title }),
  );
  const instruction = $derived(instructionText(l, state));
  const hint = $derived.by(() => {
    const kind = state.pending?.kind ?? 'none';
    if (!settings.rulesHints || state.status !== 'playing' || state.legal.length === 0) return null;
    // A panel that hands over its own instruction shows the rule behind it itself.
    if (kind === 'none' || hostedInstruction !== null) return null;
    return l.t(`hint-${kind.replaceAll('_', '-')}`);
  });

  // Under a coach the round never moves on from the bar.
  const legal = $derived(
    coach === null ? state.legal : state.legal.filter((cmd) => cmd !== 'next_round'),
  );
  const coachHosted: readonly HostedAction[] = [
    { id: -1, action: () => coachAction, shown: () => true },
  ];
  const actions = $derived(
    coach !== null && coachButton && coach.button !== null ? coachHosted : hosted,
  );
</script>

{#snippet coachText()}
  <span class="coach" data-testid="coach-text"><RichText parts={coach?.text ?? []} /></span>
{/snippet}

{#snippet coachAction()}
  {#if coach?.button}
    {@const button = coach.button}
    <Button variant="primary" data-testid="coach-next" fit onclick={() => button.run()}
      >{button.label}</Button
    >
  {/if}
{/snippet}

<div class="phase-bar" data-testid="phase-bar">
  <div class="steps" aria-hidden="true">
    {#each steps as n (n)}
      <span data-part="step-bar" data-done={n <= reached ? '' : undefined}></span>
    {/each}
  </div>
  <p class="step" data-testid="phase-step" data-coach-step={coach?.step}>{stepLabel}</p>
  <PhaseActions
    localiser={l}
    {legal}
    {instruction}
    waiting={coach === null &&
      state.status === 'playing' &&
      state.legal.length === 0 &&
      hosted.length === 0}
    hostedInstruction={coach === null ? hostedInstruction : coachText}
    hint={coach === null ? hint : null}
    {onCommand}
    errorCount={state.errorCount}
    hosted={actions}
  />
</div>

<style>
  .steps {
    display: flex;
    gap: 4px;
    margin-bottom: 4px;
  }

  .steps span {
    background: var(--line);
    border-radius: 2px;
    flex: 1;
    height: 4px;
  }

  .steps [data-done] {
    background: var(--accent);
  }

  .coach {
    display: block;
    font-size: 0.8125rem;
    font-weight: 400;
    line-height: 1.3;
  }

  .step {
    color: var(--muted);
    font-size: 0.6875rem;
    letter-spacing: 0.06em;
    line-height: 1.3;
    margin: 0;
    text-transform: uppercase;
  }

  @media (forced-colors: active) {
    .steps span {
      background: Canvas;
      border: 1px solid CanvasText;
    }

    .steps [data-done] {
      background: CanvasText;
    }
  }
</style>
