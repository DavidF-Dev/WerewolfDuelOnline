<script lang="ts">
  import { showdownOrder, type Plan, type Seat, type View } from '@wwd/engine';
  import { plainText, richMessage, type Localiser, type RichPart } from '@wwd/client-core';
  import { initiative } from '../cards.js';
  import CharacterCard from '../components/CharacterCard.svelte';
  import { fitText } from '../components/fit-text.js';
  import RichText from '../kit/RichText.svelte';
  import { planSummaryParts, planText } from '../text.js';
  import { roundReveal, type SequencedEvent } from './showdown.js';

  interface Props {
    localiser: Localiser;
    view: View;
    events: SequencedEvent[];
    seat: Seat;
    /** How each seat is named. */
    names: Record<Seat, string>;
    /** Draws the cards smaller, for a screen short of room. */
    compact?: boolean;
  }

  let { localiser: l, view, events, seat, names, compact = false }: Props = $props();

  const index = (s: Seat): 0 | 1 => (s === 'p0' ? 0 : 1);
  const reveal = $derived(roundReveal(events));

  interface Shown {
    seat: Seat;
    plan: Plan;
    position: number;
    printed: number;
    effective: number | null;
  }

  /** The opponent's plan, then mine, each with its place in the showdown order. */
  const panels = $derived.by((): Shown[] => {
    const order = reveal?.order ?? showdownOrder(view) ?? null;
    const seats: Seat[] = seat === 'p0' ? ['p1', 'p0'] : ['p0', 'p1'];
    return seats.flatMap((s) => {
      const shown = view.players[index(s)].plan;
      const plan =
        reveal?.plans[index(s)] ??
        (typeof shown === 'object' && 'revealed' in shown ? shown.revealed : null);
      if (plan === null || order === null) return [];
      return [
        {
          seat: s,
          plan,
          position: order.indexOf(s) + 1,
          printed: initiative(plan.character),
          effective: reveal?.effective[index(s)] ?? null,
        },
      ];
    });
  });

  /** The panel's place in the showdown order, then its initiative once the reveal gives it. */
  function orderLines(panel: Shown): string[] {
    const position = l.t('plan-panel-position', { position: panel.position });
    if (panel.effective === null) return [position];
    const shown =
      panel.effective === panel.printed
        ? String(panel.printed)
        : l.t('reveal-initiative-change', { printed: panel.printed, effective: panel.effective });
    return [position, l.t('plan-panel-initiative', { initiative: shown })];
  }

  /** "**Mika**: **Wolfen** → **Knight**", with the plan's own parts marked as the plan. */
  function planLine(panel: Shown): RichPart[] {
    const plan = planSummaryParts(l, panel.plan);
    return richMessage(
      l,
      'plan-panel-plan',
      { name: names[panel.seat], plan: plainText(plan) },
      { name: 'player', plan: { parts: plan } },
    );
  }

  function spoken(panel: Shown): string {
    const args = {
      name: names[panel.seat],
      plan: planText(l, panel.plan),
      position: panel.position,
    };
    return panel.effective === null
      ? l.t('plan-panel-spoken-unknown', args)
      : l.t('plan-panel-spoken', { ...args, effective: panel.effective, printed: panel.printed });
  }
</script>

{#if panels.length === 2}
  <ul
    class={['plans', { compact }]}
    aria-label={l.t('plan-panels-heading')}
    data-testid="plan-panels"
  >
    {#each panels as panel (panel.seat)}
      <li class="plan" data-testid="plan-panel-{panel.seat}">
        <CharacterCard localiser={l} character={panel.plan.character} size="target" />
        <p class="text">
          <span aria-hidden="true">
            <span class="line" data-part="plan-line"><RichText parts={planLine(panel)} /></span>
            {#each orderLines(panel) as line (line)}
              <span class="line muted" data-part="plan-order" use:fitText>{line}</span>
            {/each}
          </span>
          <span class="visually-hidden">{spoken(panel)}</span>
        </p>
      </li>
    {/each}
  </ul>
{/if}

<style>
  /* Side by side while both fit with their order lines whole; otherwise one per row. */
  .plans {
    container-type: inline-size;
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .plan {
    align-items: flex-start;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 8%, transparent);
    display: flex;
    flex: 1 1 0;
    gap: 6px;
    margin: 0;
    padding: 6px;
  }

  .text {
    font-size: 0.75rem;
    line-height: 1.2;
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .line {
    display: block;
  }

  .muted {
    color: var(--muted);
    white-space: nowrap;
  }

  .compact .plan > :global(.slot) {
    zoom: 0.75;
  }

  /* With larger text the panels go one per row, their cards drawn smaller to keep them short. */
  @container (width < 18rem) {
    .plan {
      flex-basis: 100%;
    }

    .plan > :global(.slot) {
      zoom: 0.75;
    }
  }
</style>
