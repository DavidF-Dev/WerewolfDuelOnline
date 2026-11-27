<script lang="ts">
  import {
    validatePlan,
    type Character,
    type Command,
    type Plan,
    type RulesConfig,
    type TargetCard as Card,
  } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { CHARACTERS, canonicalTargets, targetId } from '../cards.js';
  import Button from '../components/Button.svelte';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import RichText from '../kit/RichText.svelte';
  import { display } from '../settings/display.svelte.js';
  import { characterName, planSummaryParts, planText } from '../text.js';
  import HandFan from './HandFan.svelte';
  import TargetGrid from './TargetGrid.svelte';
  import { handInstruction, handPrimary } from './primary.svelte.js';

  interface Props {
    localiser: Localiser;
    hand: Character[];
    legal: Command[];
    /** The room's rules, for the engine's reason a target can't be added; null before the welcome. */
    config: RulesConfig | null;
    onCommand: (cmd: Command) => void;
    /** Changes whenever the referee reports a problem, which frees a sent command for a retry. */
    errorCount?: number;
  }

  let { localiser: l, hand, legal, config, onCommand, errorCount = 0 }: Props = $props();
  const uid = $props.id();

  type PlanCommand = Extract<Command, { submit_plan: Plan }>;

  const planCommands: PlanCommand[] = $derived(
    legal.filter((cmd): cmd is PlanCommand => typeof cmd === 'object' && 'submit_plan' in cmd),
  );
  const offered = $derived(
    CHARACTERS.filter(
      (c) => hand.includes(c) && planCommands.some((cmd) => cmd.submit_plan.character === c),
    ),
  );

  let chosen = $state<Character | null>(null);
  let selected = $state<Card[]>([]);
  // Whether the Fool in `selected` was chosen by the app rather than the player.
  let foolByApp = $state(false);
  let confirming = $state(false);
  // One plan per offer: sealing stays inert until a new legal list or a reported problem.
  let sentFor = $state.raw<{ legal: Command[]; errorCount: number } | null>(null);
  const sent = $derived(sentFor?.legal === legal && sentFor.errorCount === errorCount);

  const active = $derived(chosen !== null && offered.includes(chosen) ? chosen : null);
  const forActive = $derived(
    planCommands.map((cmd) => cmd.submit_plan).filter((p) => p.character === active),
  );

  const includes = (cards: readonly Card[], card: Card): boolean =>
    cards.some((c) => targetId(c) === targetId(card));

  const fits = (plan: Plan, cards: readonly Card[]): boolean =>
    cards.every((card) => includes(plan.targets, card));

  /** The legal command whose targets are exactly the selected set, in whatever order it lists them. */
  const match = $derived(
    planCommands.find(
      ({ submit_plan: p }) =>
        p.character === active && p.targets.length === selected.length && fits(p, selected),
    ),
  );
  const draft = $derived<Plan | null>(
    active === null ? null : { character: active, targets: canonicalTargets(selected) },
  );

  /** Why `card` can't be added: the engine's reason when it gives one, else a fallback from `legal`. */
  function blockedReason(active: Character, card: Card): string | null {
    if (includes(selected, card)) return null;
    const grown = [...selected, card];
    if (forActive.some((p) => fits(p, grown))) return null;
    const engine =
      config === null
        ? null
        : validatePlan({ character: active, targets: canonicalTargets(grown) }, config);
    if (engine !== null && engine !== 'error-too-few-targets') return l.t(engine);
    return l.t(forActive.some((p) => fits(p, [card])) ? 'target-limit' : 'target-not-allowed');
  }

  function targetShown(card: Card) {
    if (active === null) return { state: 'normal' as const };
    const reason = blockedReason(active, card);
    if (reason !== null) return { state: 'disabled' as const, reason };
    return { state: includes(selected, card) ? ('selected' as const) : ('normal' as const) };
  }

  const plansFor = (c: Character): Plan[] =>
    planCommands.map((cmd) => cmd.submit_plan).filter((p) => p.character === c);

  /** Whether every legal plan for `c` targets the Fool alone, so the app can choose it. */
  const onlyFool = (c: Character): boolean => {
    const plans = plansFor(c);
    return (
      plans.length > 0 && plans.every((p) => p.targets.length === 1 && p.targets[0] === 'fool')
    );
  };

  /**
   * Chooses `c` as the plan's character, or clears the choice when it is already chosen. A Fool the
   * player chose stays when `c` may target it; one the app chose is cleared, and chosen again for a
   * character that can only target the Fool.
   */
  function choose(c: Character): void {
    const next = c === active ? null : c;
    const keepFool =
      next !== null &&
      !foolByApp &&
      includes(selected, 'fool') &&
      plansFor(next).some((p) => includes(p.targets, 'fool'));
    chosen = next;
    foolByApp = !keepFool && next !== null && onlyFool(next);
    selected = keepFool || foolByApp ? ['fool'] : [];
  }

  function toggle(card: Card): void {
    if (card === 'fool') foolByApp = false;
    selected = includes(selected, card)
      ? selected.filter((s) => targetId(s) !== targetId(card))
      : [...selected, card];
  }

  function send(): void {
    confirming = false;
    if (match === undefined || sent) return;
    sentFor = { legal, errorCount };
    onCommand(match);
  }

  function seal(): void {
    if (match === undefined || sent) return;
    if (display.confirmPlan) confirming = true;
    else send();
  }

  const hosted = handPrimary(() => sealButton);
  const instructed = handInstruction(() => summary);
</script>

{#snippet summary()}
  <span data-testid="plan-summary">
    {#if draft === null}
      {l.t('plan-summary-empty')}
    {:else}
      <span aria-hidden="true"><RichText parts={planSummaryParts(l, draft)} /></span>
      <span class="visually-hidden">{l.t('plan-summary', { plan: planText(l, draft) })}</span>
    {/if}
  </span>
{/snippet}

{#snippet sealButton()}
  <Button
    variant="primary"
    disabled={match === undefined}
    aria-disabled={sent}
    aria-describedby={match === undefined ? `${uid}-seal-note` : undefined}
    aria-haspopup={display.confirmPlan ? 'dialog' : undefined}
    data-testid="seal-plan"
    fit
    onclick={seal}
    busy={sent}>{l.t('plan-seal')}</Button
  >
  {#if match === undefined}
    <span id="{uid}-seal-note" class="visually-hidden">{l.t('plan-seal-incomplete')}</span>
  {/if}
{/snippet}

<section aria-label={l.t('plan-heading')} class="plan" data-testid="plan-builder">
  <TargetGrid
    localiser={l}
    {hand}
    shown={targetShown}
    onselect={active === null ? undefined : toggle}
  />
  <HandFan
    localiser={l}
    {hand}
    chosen={active}
    onchoose={choose}
    {offered}
    reason={l.t('plan-character-not-offered')}
    testId="plan-characters"
  />
  {#if !instructed}
    <p class="summary" aria-live="polite">{@render summary()}</p>
  {/if}
  {#if !hosted}
    <p class="seal">{@render sealButton()}</p>
  {/if}
  {#if confirming && draft !== null}
    <ConfirmDialog
      title={l.t('plan-confirm-title')}
      detail={planText(l, draft)}
      confirmLabel={l.t('plan-seal')}
      cancelLabel={l.t('plan-confirm-cancel')}
      onConfirm={send}
      onCancel={() => (confirming = false)}
    >
      {#if display.rulesHints}<p class="note" data-testid="plan-hint">{l.t('hint-plan')}</p>{/if}
    </ConfirmDialog>
  {/if}
</section>

<style>
  .plan {
    display: flex;
    flex: 1 0 auto;
    flex-direction: column;
    gap: 6px;
  }

  p {
    margin: 0;
  }

  .summary {
    font-weight: 600;
  }
</style>
