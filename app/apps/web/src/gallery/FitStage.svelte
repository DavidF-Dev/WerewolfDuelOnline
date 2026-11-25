<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import Button from '../components/Button.svelte';
  import Screen from '../components/Screen.svelte';
  import Chip from '../kit/Chip.svelte';
  import IconButton from '../kit/IconButton.svelte';
  import Panel from '../kit/Panel.svelte';

  interface Props {
    localiser: Localiser;
    /** Shows more panels than the middle area holds. */
    overflow?: boolean;
  }

  let { localiser: l, overflow = false }: Props = $props();
  const panels = $derived(
    overflow
      ? ['Your plan', 'Your hand', 'Targets', 'More than fits', 'Still more', 'And more']
      : ['Your plan', 'Your hand'],
  );
</script>

<Screen title="Round 3" testId="kit-fit" fit tight>
  {#snippet left()}<IconButton icon="menu" label="Menu" />{/snippet}
  {#snippet right()}<IconButton icon="log" label="Log" />{/snippet}
  {#snippet footer()}
    <div data-testid="kit-fit-footer">
      <div class="steps" aria-hidden="true">
        <span class="on"></span><span></span><span></span><span></span>
      </div>
      <p class="step">Plan · choose 1 character and its targets</p>
      <p class="instruction">Ready to seal your plan?</p>
      <Button variant="primary" data-testid="kit-fit-action" fit>{l.t('plan-seal')}</Button>
    </div>
  {/snippet}

  <Panel tight><b>Mika</b> <Chip>plan sealed · 1 target</Chip></Panel>
  {#each panels as title (title)}
    <Panel {title} tight>
      <p class="filler">A panel of the middle area.</p>
    </Panel>
  {/each}
</Screen>

<style>
  .steps {
    display: flex;
    gap: 4px;
    margin-bottom: 6px;
  }

  .steps span {
    background: var(--line);
    border-radius: 2px;
    flex: 1;
    height: 4px;
  }

  .steps .on {
    background: var(--accent);
  }

  .step {
    color: var(--muted);
    font-size: 0.6875rem;
    letter-spacing: 0.06em;
    margin: 0;
    text-transform: uppercase;
  }

  .instruction {
    font-weight: 600;
    margin: 2px 0 8px;
  }

  .filler {
    margin: 0;
    min-height: 4rem;
  }
</style>
