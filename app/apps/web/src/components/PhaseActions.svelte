<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Command } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import type { HostedAction } from '../table/primary.svelte.js';
  import { commandLabel } from '../text.js';
  import Spinner from '../kit/Spinner.svelte';
  import Button from './Button.svelte';

  interface Props {
    localiser: Localiser;
    legal: Command[];
    /** The one-line instruction for the current phase. */
    instruction: string;
    /** Whether `instruction` says this seat waits for the opponent, which shows a spinner after it. */
    waiting?: boolean;
    /** Rich content shown in place of `instruction`, handed over by a phase panel. */
    hostedInstruction?: Snippet | null;
    /** A second line explaining the rule behind this phase. */
    hint?: string | null;
    onCommand: (cmd: Command) => void;
    /** Changes whenever the referee reports a problem, which frees a sent command for a retry. */
    errorCount?: number;
    /** Primary actions handed over by the phase panels, shown before the commands offered here. */
    hosted?: readonly HostedAction[];
  }

  let {
    localiser: l,
    legal,
    instruction,
    waiting = false,
    hostedInstruction = null,
    hint = null,
    onCommand,
    errorCount = 0,
    hosted = [],
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
  <h2 id="{uid}-heading" class="visually-hidden">{l.t('actions-heading')}</h2>
  <p class="instruction" aria-live="polite" tabindex="-1" data-testid="phase-instruction">
    {#if hostedInstruction === null}{instruction}{#if waiting}<Spinner
        />{/if}{:else}{@render hostedInstruction()}{/if}
  </p>
  {#if hint !== null}
    <p class="note" data-testid="phase-hint">{hint}</p>
  {/if}
  {#if hosted.length + actions.length > 0}
    <ul class="actions">
      {#each hosted as { id, action } (id)}
        {@const shown = action()}
        <li>{@render shown()}</li>
      {/each}
      {#each actions as cmd (cmd)}
        <li>
          <Button
            variant="primary"
            aria-disabled={sent}
            data-testid="action-next-round"
            fit
            onclick={() => send(cmd)}>{commandLabel(l, cmd)}</Button
          >
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .instruction {
    font-weight: 600;
    margin: 0;
  }

  .instruction:focus:not(:focus-visible) {
    outline: none;
  }

  .note {
    color: var(--muted);
    font-size: 0.75rem;
    margin: 2px 0 0;
  }

  .actions {
    display: flex;
    gap: 8px;
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
  }

  .actions li {
    flex: 1 1 0;
    margin: 0;
    min-width: 0;
  }
</style>
