<script lang="ts">
  import type { Command, Seat, View } from '@wwd/engine';
  import type { GameClientState, Localiser } from '@wwd/client-core';
  import PhaseActions from '../components/PhaseActions.svelte';
  import { display } from '../settings/display.svelte.js';
  import { instructionText } from '../text.js';
  import PlanSheet from './PlanSheet.svelte';
  import RevealPanel from './RevealPanel.svelte';
  import ShowdownList from './ShowdownList.svelte';

  interface Props {
    localiser: Localiser;
    state: GameClientState;
    view: View;
    seat: Seat;
    onCommand: (cmd: Command) => void;
    /** Called when the showdown list has been stepped to its end and focus should move on. */
    onCaughtUp?: () => void;
  }

  let { localiser: l, state, view, seat, onCommand, onCaughtUp }: Props = $props();

  const canPlan = $derived(
    state.legal.some((cmd) => typeof cmd === 'object' && 'submit_plan' in cmd),
  );
  const revealing = $derived(
    typeof view.phase === 'object' &&
      ('reveal_hourglass' in view.phase || 'reveal_potion' in view.phase),
  );
  // The Hunter prompt lives in the showdown list, which must show while it is offered.
  const showdown = $derived(
    view.showdown !== null ||
      state.legal.some((cmd) => typeof cmd === 'object' && 'hunter_spend_cross' in cmd),
  );
  const instruction = $derived(instructionText(l, state));
  const hint = $derived.by(() => {
    const kind = state.pending?.kind ?? 'none';
    if (!display.rulesHints || state.status !== 'playing' || state.legal.length === 0) return null;
    if (kind === 'none') return null;
    return l.t(`hint-${kind.replaceAll('_', '-')}`);
  });
</script>

<div class="phase-bar" data-testid="phase-bar">
  {#if canPlan}
    <PlanSheet
      localiser={l}
      hand={view.players[seat === 'p0' ? 0 : 1].hand ?? []}
      legal={state.legal}
      config={state.config}
      {onCommand}
      errorCount={state.errorCount}
    />
  {/if}
  {#if revealing}
    <RevealPanel
      localiser={l}
      {view}
      {seat}
      events={state.events}
      legal={state.legal}
      {onCommand}
      errorCount={state.errorCount}
    />
  {/if}
  {#if showdown}
    {#key view.round}
      <ShowdownList
        localiser={l}
        events={state.events}
        {seat}
        legal={state.legal}
        {onCommand}
        errorCount={state.errorCount}
        {onCaughtUp}
      />
    {/key}
  {/if}
  <PhaseActions
    localiser={l}
    legal={state.legal}
    {instruction}
    {hint}
    {onCommand}
    errorCount={state.errorCount}
  />
</div>

<style>
  .phase-bar {
    background: var(--surface-2);
    border-block-start: 3px solid var(--accent);
    border-radius: var(--radius);
    display: grid;
    gap: 0.75rem;
    padding: 0.75rem;
  }
</style>
