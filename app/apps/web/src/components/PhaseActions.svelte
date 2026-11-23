<script lang="ts">
  import type { Command } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { commandLabel } from '../text.js';

  interface Props {
    localiser: Localiser;
    legal: Command[];
    /** The one-line instruction for the current phase. */
    instruction: string;
    onCommand: (cmd: Command) => void;
    /** Changes whenever the referee reports a problem, which frees a sent command for a retry. */
    errorCount?: number;
  }

  let { localiser: l, legal, instruction, onCommand, errorCount = 0 }: Props = $props();
  const uid = $props.id();

  // Plans are built in the plan builder; every other legal command is one button.
  const actions = $derived(
    legal.filter((cmd) => typeof cmd === 'string' || !('submit_plan' in cmd)),
  );

  // One command per offer: the buttons stay inert until a new legal list or a reported problem.
  let sentFor = $state.raw<{ legal: Command[]; errorCount: number } | null>(null);
  const sent = $derived(sentFor?.legal === legal && sentFor.errorCount === errorCount);

  function send(cmd: Command): void {
    if (sent) return;
    sentFor = { legal, errorCount };
    onCommand(cmd);
  }

  function testId(cmd: Command): string {
    if (cmd === 'next_round') return 'action-next-round';
    if (cmd === 'resign') return 'action-resign';
    if ('place_hourglasses' in cmd) return `action-hourglasses-${cmd.place_hourglasses.n}`;
    if ('choose_potion_target' in cmd) return `action-potion-${cmd.choose_potion_target.card}`;
    if ('hunter_spend_cross' in cmd) {
      return cmd.hunter_spend_cross.spend ? 'action-hunter-spend' : 'action-hunter-keep';
    }
    return 'action-plan';
  }
</script>

<section aria-labelledby="{uid}-heading" data-testid="phase-actions">
  <h2 id="{uid}-heading" tabindex="-1">{l.t('actions-heading')}</h2>
  <p aria-live="polite" data-testid="phase-instruction">{instruction}</p>
  {#if actions.length > 0}
    <ul>
      {#each actions as cmd (testId(cmd))}
        <li>
          <button
            type="button"
            aria-disabled={sent}
            data-testid={testId(cmd)}
            onclick={() => send(cmd)}>{commandLabel(l, cmd)}</button
          >
        </li>
      {/each}
    </ul>
  {/if}
</section>
