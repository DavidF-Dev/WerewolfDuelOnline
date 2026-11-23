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
  import { CHARACTERS, TARGET_CARDS, canonicalTargets, targetId } from '../cards.js';
  import Button from '../components/Button.svelte';
  import CharacterCard from '../components/CharacterCard.svelte';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import TargetCard from '../components/TargetCard.svelte';
  import { display } from '../settings/display.svelte.js';
  import { characterName, planText } from '../text.js';

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
  function blockedReason(card: Card): string | null {
    if (active === null || includes(selected, card)) return null;
    const grown = [...selected, card];
    if (forActive.some((p) => fits(p, grown))) return null;
    const engine =
      config === null
        ? null
        : validatePlan({ character: active, targets: canonicalTargets(grown) }, config);
    if (engine !== null && engine !== 'error-too-few-targets') return l.t(engine);
    return l.t(forActive.some((p) => fits(p, [card])) ? 'target-limit' : 'target-not-allowed');
  }

  const inHand = (card: Card): boolean => card !== 'fool' && hand.includes(card.character);

  function targetProps(card: Card) {
    const reason = blockedReason(card);
    if (reason !== null) return { state: 'disabled' as const, reason, mark: undefined };
    return {
      state: includes(selected, card) ? ('selected' as const) : ('normal' as const),
      reason: undefined,
      mark: inHand(card) ? l.t('plan-target-in-hand') : undefined,
    };
  }

  function shortSummary(plan: Plan): string {
    const character = characterName(l, plan.character);
    if (plan.targets.length === 0) return l.t('plan-summary-short-none', { character });
    const targets = plan.targets
      .map((card) =>
        card === 'fool' ? l.t('plan-summary-fool') : characterName(l, card.character),
      )
      .join(' + ');
    return l.t('plan-summary-short', { character, targets });
  }

  function choose(c: Character): void {
    chosen = c;
    selected = [];
  }

  function toggle(card: Card): void {
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
</script>

<section aria-labelledby="{uid}-heading" class="sheet" data-testid="plan-builder">
  <h2 id="{uid}-heading">{l.t('plan-heading')}</h2>

  <h3 id="{uid}-characters">{l.t('plan-characters-heading')}</h3>
  <ul class="cards" aria-labelledby="{uid}-characters" data-testid="plan-characters">
    {#each offered as c (c)}
      <li>
        <CharacterCard
          localiser={l}
          character={c}
          state={active === c ? 'selected' : 'normal'}
          testId="plan-character-{c}"
          onselect={() => choose(c)}
        />
      </li>
    {/each}
  </ul>

  {#if active === null}
    <p class="note">{l.t('target-choose-character-first')}</p>
  {:else}
    <p class="detail" data-testid="plan-detail">
      {l.t('plan-detail', {
        name: characterName(l, active),
        ability: l.t(`card-ability-${active.replaceAll('_', '-')}`),
      })}
    </p>
    <h3 id="{uid}-targets">{l.t('plan-targets-heading')}</h3>
    <ul class="cards" aria-labelledby="{uid}-targets" data-testid="plan-targets">
      {#each TARGET_CARDS as card (targetId(card))}
        {@const shown = targetProps(card)}
        <li>
          <TargetCard
            localiser={l}
            {card}
            state={shown.state}
            reason={shown.reason}
            mark={shown.mark}
            testId="target-{targetId(card)}"
            onselect={() => toggle(card)}
          />
        </li>
      {/each}
    </ul>
  {/if}

  <p class="summary" aria-live="polite" data-testid="plan-summary">
    {#if draft === null}
      {l.t('plan-summary-empty')}
    {:else}
      <span aria-hidden="true">{shortSummary(draft)}</span>
      <span class="visually-hidden">{l.t('plan-summary', { plan: planText(l, draft) })}</span>
    {/if}
  </p>
  <p class="seal">
    <Button
      variant="primary"
      disabled={match === undefined}
      aria-disabled={sent}
      aria-describedby={match === undefined ? `${uid}-seal-note` : undefined}
      aria-haspopup={display.confirmPlan ? 'dialog' : undefined}
      data-testid="seal-plan"
      onclick={seal}>{l.t('plan-seal')}</Button
    >
    {#if match === undefined}
      <span id="{uid}-seal-note" class="note">{l.t('plan-seal-incomplete')}</span>
    {/if}
  </p>
  {#if confirming && draft !== null}
    <ConfirmDialog
      title={l.t('plan-confirm-title')}
      detail={planText(l, draft)}
      confirmLabel={l.t('plan-seal')}
      cancelLabel={l.t('plan-confirm-cancel')}
      onConfirm={send}
      onCancel={() => (confirming = false)}
    />
  {/if}
</section>

<style>
  .sheet {
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

  p {
    margin: 0;
  }

  .cards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .cards li {
    margin: 0;
  }

  .detail {
    border-inline-start: 4px solid var(--accent);
    padding-inline-start: 0.5rem;
  }

  .summary {
    font-weight: 700;
  }
</style>
