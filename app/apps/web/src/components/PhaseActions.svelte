<script lang="ts">
  import type { Command } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { commandLabel } from '../text.js';
  import Button from './Button.svelte';

  interface Props {
    localiser: Localiser;
    legal: Command[];
    /** The one-line instruction for the current phase. */
    instruction: string;
    /** A second line explaining the rule behind this phase. */
    hint?: string | null;
    onCommand: (cmd: Command) => void;
    /** Changes whenever the referee reports a problem, which frees a sent command for a retry. */
    errorCount?: number;
  }

  let {
    localiser: l,
    legal,
    instruction,
    hint = null,
    onCommand,
    errorCount = 0,
  }: Props = $props();
  const uid = $props.id();

  const actions = $derived(legal.filter((cmd): cmd is 'next_round' => cmd === 'next_round'));

  // One command per offer: the buttons stay inert until a new legal list or a reported problem.
  let sentFor = $state.raw<{ legal: Command[]; errorCount: number } | null>(null);
  const sent = $derived(sentFor?.legal === legal && sentFor.errorCount === errorCount);

  function send(cmd: Command): void {
    if (sent) return;
    sentFor = { legal, errorCount };
    onCommand(cmd);
  }
</script>

<section aria-labelledby="{uid}-heading" data-testid="phase-actions">
  <h2 id="{uid}-heading" tabindex="-1">{l.t('actions-heading')}</h2>
  <p class="instruction" aria-live="polite" data-testid="phase-instruction">{instruction}</p>
  {#if hint !== null}
    <p class="note" data-testid="phase-hint">{hint}</p>
  {/if}
  {#if actions.length > 0}
    <ul>
      {#each actions as cmd (cmd)}
        <li>
          <Button
            variant="primary"
            aria-disabled={sent}
            data-testid="action-next-round"
            onclick={() => send(cmd)}>{commandLabel(l, cmd)}</Button
          >
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  h2 {
    font-size: 1.125rem;
    margin: 0;
  }

  .instruction {
    font-weight: 700;
    margin: 0.25rem 0;
  }

  ul {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
  }
</style>
