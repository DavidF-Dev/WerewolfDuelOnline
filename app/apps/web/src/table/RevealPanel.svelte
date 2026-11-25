<script lang="ts">
  import {
    effectiveInitiative,
    type Character,
    type Command,
    type Seat,
    type Tiebreak,
    type View,
  } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { initiative } from '../cards.js';
  import Button from '../components/Button.svelte';
  import CharacterCard from '../components/CharacterCard.svelte';
  import Label from '../kit/Label.svelte';
  import Note from '../kit/Note.svelte';
  import RichText from '../kit/RichText.svelte';
  import Spinner from '../kit/Spinner.svelte';
  import Stepper from '../kit/Stepper.svelte';
  import { characterName, commandLabel, planSummaryParts, planText } from '../text.js';
  import { handInstruction, handPrimary } from './primary.svelte.js';
  import type { SequencedEvent } from './showdown.js';

  interface Props {
    localiser: Localiser;
    view: View;
    seat: Seat;
    events: SequencedEvent[];
    legal: Command[];
    onCommand: (cmd: Command) => void;
    /** The room's tiebreak rule, given in the note on the order; null before the welcome. */
    tiebreak?: Tiebreak | null;
    /** Changes whenever the referee reports a problem, which frees a sent command for a retry. */
    errorCount?: number;
  }

  let {
    localiser: l,
    view,
    seat,
    events,
    legal,
    onCommand,
    tiebreak = null,
    errorCount = 0,
  }: Props = $props();
  const uid = $props.id();

  /** The initiatives the track shows, 0 to 8. */
  const SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

  type PotionCommand = Extract<Command, { choose_potion_target: unknown }>;
  type PlaceCommand = Extract<Command, { place_hourglasses: unknown }>;

  const places = $derived(
    legal
      .filter((cmd): cmd is PlaceCommand => typeof cmd === 'object' && 'place_hourglasses' in cmd)
      .sort((a, b) => a.place_hourglasses.n - b.place_hourglasses.n),
  );
  const potion = $derived(
    legal.filter(
      (cmd): cmd is PotionCommand => typeof cmd === 'object' && 'choose_potion_target' in cmd,
    ),
  );
  const potionPhase = $derived(
    potion.length > 0 || (typeof view.phase === 'object' && 'reveal_potion' in view.phase),
  );
  const size = $derived(potionPhase ? 'target' : 'medium');

  const myPlan = $derived.by(() => {
    const plan = view.players[seat === 'p0' ? 0 : 1].plan;
    return typeof plan === 'object' && 'revealed' in plan ? plan.revealed : null;
  });
  const myCharacter = $derived(myPlan?.character ?? null);

  /** The Hourglasses the opponent placed this round, once the event has arrived. */
  const opponentPlaced = $derived.by((): number | null => {
    for (let i = events.length - 1; i >= 0; i--) {
      const kind = events[i]![1].kind;
      if ('hourglasses_placed' in kind && kind.hourglasses_placed.seat !== seat) {
        return kind.hourglasses_placed.n;
      }
      if ('round_started' in kind || 'segment_started' in kind) return null;
    }
    return null;
  });

  let wanted = $state(0);
  // The stepper only ever rests on a value the engine offers.
  const index = $derived(
    places.reduce((best, cmd, i) => (cmd.place_hourglasses.n <= wanted ? i : best), 0),
  );
  const chosen = $derived(places[index]);
  const effective = $derived(
    myCharacter === null || chosen === undefined
      ? null
      : effectiveInitiative(myCharacter, chosen.place_hourglasses.n),
  );

  let sentFor = $state.raw<{ legal: Command[]; errorCount: number } | null>(null);
  const sent = $derived(sentFor?.legal === legal && sentFor.errorCount === errorCount);

  function step(by: -1 | 1): void {
    const next = places[index + by];
    if (next !== undefined) wanted = next.place_hourglasses.n;
  }

  function send(cmd: Command): void {
    if (sent) return;
    sentFor = { legal, errorCount };
    onCommand(cmd);
  }

  let aimed = $state<Character | null>(null);
  const aim = $derived(potion.find((cmd) => cmd.choose_potion_target.card === aimed));

  const hostedPlace = handPrimary(
    () => placeButton,
    () => chosen !== undefined,
  );
  const hostedAim = handPrimary(
    () => aimButton,
    () => potion.length > 0,
  );
  // The spend panel shows the rule itself, so the phase bar asks only the question.
  handInstruction(
    () => placeInstruction,
    () => chosen !== undefined,
  );
</script>

{#snippet placeInstruction()}{l.t('reveal-hourglass-instruction')}{/snippet}

{#snippet placeButton()}
  {#if chosen !== undefined}
    <Button
      variant="primary"
      aria-disabled={sent}
      data-testid="place-hourglasses"
      data-phase-focus
      onclick={() => send(chosen)}
      >{commandLabel(l, chosen)}{#if sent}<Spinner spaced={false} />{/if}</Button
    >
  {/if}
{/snippet}

{#snippet aimButton()}
  <Button
    variant="primary"
    disabled={aim === undefined}
    aria-disabled={sent}
    data-testid="confirm-potion"
    onclick={() => {
      if (aim !== undefined) send(aim);
    }}>{aim === undefined ? l.t('reveal-potion-confirm') : commandLabel(l, aim)}</Button
  >
{/snippet}

<section aria-labelledby="{uid}-heading" class="reveal" data-testid="reveal">
  <h2 id="{uid}-heading" class="visually-hidden">{l.t('reveal-heading')}</h2>

  <div class="panel versus" data-testid="reveal-versus">
    <span class="face-down {size}" role="img" aria-label={l.t('reveal-face-down')}></span>
    <span class="vs" aria-hidden="true">{l.t('reveal-versus')}</span>
    <span class="mine-card">
      {#if myCharacter !== null}
        <CharacterCard localiser={l} character={myCharacter} {size} testId="reveal-my-card" />
      {/if}
    </span>
    {#if opponentPlaced !== null}
      <p class="caption theirs" data-testid="opponent-hourglasses">
        {l.t('reveal-opponent-placed', { n: opponentPlaced })}
      </p>
    {/if}
    {#if myPlan !== null}
      <p class="caption mine" data-testid="reveal-my-plan">
        <span aria-hidden="true"><RichText parts={planSummaryParts(l, myPlan)} /></span>
        <span class="visually-hidden">{l.t('reveal-my-plan', { plan: planText(l, myPlan) })}</span>
      </p>
    {/if}
  </div>

  {#if chosen !== undefined}
    <div class="panel" role="group" aria-labelledby="{uid}-hourglasses">
      <Label as="h3" id="{uid}-hourglasses">{l.t('reveal-hourglasses-heading')}</Label>
      <div class="spend">
        <Stepper
          label={l.t('reveal-stepper')}
          decreaseLabel={l.t('reveal-fewer')}
          increaseLabel={l.t('reveal-more')}
          value={chosen.place_hourglasses.n}
          min={places[0]?.place_hourglasses.n ?? 0}
          max={places.at(-1)?.place_hourglasses.n ?? 0}
          onchange={(n) => step(n > chosen.place_hourglasses.n ? 1 : -1)}
          testId="hourglass"
          live={false}
        />
        {#if myCharacter !== null && effective !== null}
          <p class="initiative" data-testid="initiative-change" aria-hidden="true">
            <span class="muted"
              >{l.t('reveal-initiative-label', { character: characterName(l, myCharacter) })}</span
            >
            <b
              >{l.t('reveal-initiative-change', {
                printed: initiative(myCharacter),
                effective,
              })}</b
            >
          </p>
          <p role="status" class="visually-hidden" data-testid="effective-initiative">
            {l.t('reveal-initiative', {
              character: characterName(l, myCharacter),
              effective,
              printed: initiative(myCharacter),
            })}
          </p>
        {/if}
      </div>
      {#if effective !== null}
        <ol class="track" data-part="track" aria-hidden="true">
          {#each SLOTS as slot (slot)}
            <li data-slot={slot} data-mine={slot === effective ? '' : undefined}>
              <span class="mark">{slot === effective ? '▲' : ''}</span><span class="slot"
                >{slot}</span
              >
            </li>
          {/each}
        </ol>
      {/if}
      <Note data-testid="reveal-note"
        >{l.t('reveal-order-note')}{#if tiebreak !== null}{' '}{l.t(
            `rules-tiebreak-${tiebreak.replaceAll('_', '-')}`,
          )}{/if}</Note
      >
      {#if !hostedPlace}<p>{@render placeButton()}</p>{/if}
    </div>
  {/if}

  {#if potion.length > 0}
    <section class="panel" aria-labelledby="{uid}-potion" data-testid="potion-picker">
      <!-- The phase bar gives the same instruction, so the heading is for screen readers only. -->
      <h3 id="{uid}-potion" class="visually-hidden">{l.t('reveal-potion-heading')}</h3>
      <ul class="cards">
        {#each potion as cmd (cmd.choose_potion_target.card)}
          <li>
            <CharacterCard
              localiser={l}
              character={cmd.choose_potion_target.card}
              size="target"
              state={aimed === cmd.choose_potion_target.card ? 'selected' : 'normal'}
              testId="action-potion-{cmd.choose_potion_target.card}"
              onselect={() => (aimed = cmd.choose_potion_target.card)}
            />
          </li>
        {/each}
      </ul>
      {#if !hostedAim}<p>{@render aimButton()}</p>{/if}
    </section>
  {/if}
</section>

<style>
  .reveal {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 6px;
  }

  .panel {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 8%, transparent);
    padding: 7px 9px;
  }

  p {
    margin: 0;
  }

  .versus {
    align-items: center;
    column-gap: 20px;
    container-type: inline-size;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    justify-items: center;
    row-gap: 4px;
  }

  /* Larger text makes two medium cards wider than a phone, so both are drawn a little smaller. */
  @container (width < 15.5rem) {
    .versus > .medium,
    .versus > .mine-card {
      zoom: 0.8;
    }
  }

  .face-down {
    justify-self: end;
  }

  .mine-card {
    display: flex;
    justify-self: start;
  }

  .vs {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .face-down {
    background: repeating-linear-gradient(45deg, var(--chip) 0 6px, var(--surface-2) 6px 12px);
    border: 2.5px solid var(--muted);
    border-radius: 9px;
    display: block;
  }

  .face-down.medium {
    height: var(--card-medium-height);
    width: var(--card-medium-width);
  }

  .face-down.target {
    border-radius: 7px;
    height: var(--card-target-height);
    width: var(--card-target-width);
  }

  .caption {
    color: var(--muted);
    font-size: 0.6875rem;
    line-height: 1.3;
    text-align: center;
  }

  .caption.theirs {
    grid-column: 1;
    justify-self: end;
  }

  .caption.mine {
    color: var(--ink);
    grid-column: 3;
    justify-self: start;
  }

  .spend {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
  }

  .initiative {
    display: grid;
    text-align: right;
  }

  .initiative .muted {
    color: var(--muted);
    font-size: 0.75rem;
  }

  .initiative b {
    font-size: 1.125rem;
    line-height: 1.2;
  }

  .track {
    display: flex;
    list-style: none;
    margin: 2px 0 6px;
    padding: 0;
  }

  .track li {
    color: var(--muted);
    display: flex;
    flex: 1;
    flex-direction: column;
    font-size: 0.6875rem;
    line-height: 1.2;
    margin: 0;
    text-align: center;
  }

  .mark {
    color: var(--accent);
    font-size: 0.75rem;
    height: 0.875rem;
    line-height: 1;
  }

  .slot {
    border-top: 2px solid var(--line);
    padding-top: 2px;
  }

  .track li[data-mine] {
    color: var(--ink);
    font-weight: 700;
  }

  .track li[data-mine] .slot {
    border-top-color: var(--accent);
  }

  /* Five to a row, or as many as fit when larger text makes the cards wider. */
  .cards {
    --gap: 4px;
    display: grid;
    gap: var(--gap);
    grid-template-columns: repeat(auto-fill, var(--card-target-width));
    justify-content: center;
    list-style: none;
    margin: 0 auto;
    max-width: calc(5 * var(--card-target-width) + 4 * var(--gap));
    padding: 0;
    width: 100%;
  }

  .cards li {
    margin: 0;
  }
</style>
