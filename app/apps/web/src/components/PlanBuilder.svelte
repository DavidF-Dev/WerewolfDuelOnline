<script lang="ts">
  import type { Character, Command, Plan, TargetCard } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { CHARACTERS, TARGET_CARDS, canonicalTargets, targetId } from '../cards.js';
  import { cardName, planText, targetName } from '../text.js';

  interface Props {
    localiser: Localiser;
    hand: Character[];
    legal: Command[];
    onCommand: (cmd: Command) => void;
    /** Changes whenever the referee reports a problem, which frees a sent command for a retry. */
    errorCount?: number;
  }

  let { localiser: l, hand, legal, onCommand, errorCount = 0 }: Props = $props();
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
  let selected = $state<TargetCard[]>([]);
  // One plan per offer: sealing stays inert until a new legal list or a reported problem.
  let sentFor = $state.raw<{ legal: Command[]; errorCount: number } | null>(null);
  const sent = $derived(sentFor?.legal === legal && sentFor.errorCount === errorCount);

  const active = $derived(chosen !== null && offered.includes(chosen) ? chosen : null);
  const forActive = $derived(
    planCommands.map((cmd) => cmd.submit_plan).filter((p) => p.character === active),
  );

  const includes = (cards: readonly TargetCard[], card: TargetCard): boolean =>
    cards.some((c) => targetId(c) === targetId(card));

  const fits = (plan: Plan, cards: readonly TargetCard[]): boolean =>
    cards.every((card) => includes(plan.targets, card));

  /** The legal command whose targets are exactly the selected set, in whatever order it lists them. */
  const match = $derived(
    planCommands.find(
      ({ submit_plan: p }) =>
        p.character === active && p.targets.length === selected.length && fits(p, selected),
    ),
  );

  /** The Fluent id explaining why `card` can't be toggled on, or null when it can. */
  function blockedReason(card: TargetCard): string | null {
    if (active === null || includes(selected, card)) return null;
    if (!forActive.some((p) => fits(p, [card]))) return 'target-not-allowed';
    if (!forActive.some((p) => fits(p, [...selected, card]))) return 'target-limit';
    return null;
  }

  const inHand = (card: TargetCard): boolean => card !== 'fool' && hand.includes(card.character);

  function choose(c: Character): void {
    chosen = c;
    selected = [];
  }

  function toggle(card: TargetCard): void {
    selected = includes(selected, card)
      ? selected.filter((s) => targetId(s) !== targetId(card))
      : [...selected, card];
  }

  function seal(): void {
    if (match === undefined || sent) return;
    sentFor = { legal, errorCount };
    onCommand(match);
  }
</script>

<section aria-labelledby="{uid}-heading" data-testid="plan-builder">
  <h2 id="{uid}-heading">{l.t('plan-heading')}</h2>

  <h3 id="{uid}-characters">{l.t('plan-characters-heading')}</h3>
  <ul aria-labelledby="{uid}-characters" data-testid="plan-characters">
    {#each offered as c (c)}
      <li>
        <button
          type="button"
          aria-pressed={active === c}
          data-testid="plan-character-{c}"
          onclick={() => choose(c)}>{cardName(l, c)}</button
        >
      </li>
    {/each}
  </ul>

  <h3 id="{uid}-targets">{l.t('plan-targets-heading')}</h3>
  {#if active === null}
    <p id="{uid}-choose-first" class="note">{l.t('target-choose-character-first')}</p>
  {/if}
  <ul aria-labelledby="{uid}-targets" data-testid="plan-targets">
    {#each TARGET_CARDS as card (targetId(card))}
      {@const id = targetId(card)}
      {@const reason = blockedReason(card)}
      {@const note = reason ?? (inHand(card) ? 'target-in-hand' : null)}
      <li>
        <button
          type="button"
          aria-pressed={includes(selected, card)}
          disabled={active === null || reason !== null}
          aria-describedby={active === null
            ? `${uid}-choose-first`
            : note === null
              ? undefined
              : `${uid}-note-${id}`}
          data-testid="target-{id}"
          onclick={() => toggle(card)}>{targetName(l, card)}</button
        >
        {#if active !== null && note !== null}
          <span id="{uid}-note-{id}" class="note">{l.t(note)}</span>
        {/if}
      </li>
    {/each}
  </ul>

  <p aria-live="polite">
    {active === null
      ? l.t('plan-summary-empty')
      : l.t('plan-summary', {
          plan: planText(l, { character: active, targets: canonicalTargets(selected) }),
        })}
  </p>
  <button
    type="button"
    disabled={match === undefined}
    aria-disabled={sent}
    aria-describedby={match === undefined ? `${uid}-seal-note` : undefined}
    data-testid="seal-plan"
    onclick={seal}>{l.t('plan-seal')}</button
  >
  {#if match === undefined}
    <span id="{uid}-seal-note" class="note">{l.t('plan-seal-incomplete')}</span>
  {/if}
</section>
