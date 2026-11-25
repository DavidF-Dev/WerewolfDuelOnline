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
  import PhaseActions from '../components/PhaseActions.svelte';
  import { display } from '../settings/display.svelte.js';
  import { instructionText } from '../text.js';
  import type { HostedAction } from './primary.svelte.js';

  interface Props {
    localiser: Localiser;
    state: GameClientState;
    view: View;
    onCommand: (cmd: Command) => void;
    /** The primary actions the phase panels hand to the bar. */
    hosted?: readonly HostedAction[];
    /** An instruction a phase panel hands to the bar, shown in place of the phase's own. */
    hostedInstruction?: Snippet | null;
  }

  let {
    localiser: l,
    state,
    view,
    onCommand,
    hosted = [],
    hostedInstruction = null,
  }: Props = $props();

  const STEPS = [1, 2, 3, 4] as const;
  const step = $derived(phaseStep(view));
  const instruction = $derived(instructionText(l, state));
  const hint = $derived.by(() => {
    const kind = state.pending?.kind ?? 'none';
    if (!display.rulesHints || state.status !== 'playing' || state.legal.length === 0) return null;
    // A panel that hands over its own instruction shows the rule behind it itself.
    if (kind === 'none' || hostedInstruction !== null) return null;
    return l.t(`hint-${kind.replaceAll('_', '-')}`);
  });
</script>

<div class="phase-bar" data-testid="phase-bar">
  <div class="steps" aria-hidden="true">
    {#each STEPS as n (n)}
      <span data-part="step-bar" data-done={n <= step.reached ? '' : undefined}></span>
    {/each}
  </div>
  <p class="step" data-testid="phase-step">{l.t(step.id)}</p>
  <PhaseActions
    localiser={l}
    legal={state.legal}
    {instruction}
    waiting={state.status === 'playing' && state.legal.length === 0 && hosted.length === 0}
    {hostedInstruction}
    {hint}
    {onCommand}
    errorCount={state.errorCount}
    {hosted}
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
