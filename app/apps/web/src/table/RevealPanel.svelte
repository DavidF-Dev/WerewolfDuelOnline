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
  import Stepper from '../kit/Stepper.svelte';
  import { commandLabel } from '../text.js';
  import type { TutorialAllow } from '../tutorial/script.js';
  import PlayerSide from './PlayerSide.svelte';
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
    /** The one choice a coach offers; every other count, and the Potion, is left out. */
    allow?: TutorialAllow | null;
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
    allow = null,
  }: Props = $props();
  const uid = $props.id();

  /** The initiatives the track shows, 0 to 8. */
  const SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

  type PotionCommand = Extract<Command, { choose_potion_target: unknown }>;
  type PlaceCommand = Extract<Command, { place_hourglasses: unknown }>;

  const places = $derived(
    legal
      .filter((cmd): cmd is PlaceCommand => typeof cmd === 'object' && 'place_hourglasses' in cmd)
      .filter((cmd) => allow === null || allow.hourglasses === cmd.place_hourglasses.n)
      .sort((a, b) => a.place_hourglasses.n - b.place_hourglasses.n),
  );
  const potion = $derived(
    allow !== null
      ? []
      : legal.filter(
          (cmd): cmd is PotionCommand => typeof cmd === 'object' && 'choose_potion_target' in cmd,
        ),
  );
  const me = $derived(view.players[seat === 'p0' ? 0 : 1]);
  const myPlan = $derived(
    typeof me.plan === 'object' && 'revealed' in me.plan ? me.plan.revealed : null,
  );
  const myCharacter = $derived(myPlan?.character ?? null);
  /** My initiative with the Hourglasses I have placed, not the ones still being chosen. */
  const myInitiative = $derived(
    myCharacter === null
      ? null
      : {
          printed: initiative(myCharacter),
          effective: effectiveInitiative(myCharacter, me.placed),
        },
  );

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
      fit
      data-phase-focus
      onclick={() => send(chosen)}
      busy={sent}>{commandLabel(l, chosen)}</Button
    >
  {/if}
{/snippet}

{#snippet aimButton()}
  <Button
    variant="primary"
    disabled={aim === undefined}
    aria-disabled={sent}
    data-testid="confirm-potion"
    fit
    onclick={() => {
      if (aim !== undefined) send(aim);
    }}>{aim === undefined ? l.t('reveal-potion-confirm') : commandLabel(l, aim)}</Button
  >
{/snippet}

<section aria-labelledby="{uid}-heading" class="reveal" data-testid="reveal">
  <h2 id="{uid}-heading" class="visually-hidden">{l.t('reveal-heading')}</h2>

  <!-- The plans are still face down, so the opponent stays on the left whoever acts first. -->
  <ul class="sides" aria-label={l.t('plan-panels-heading')} data-testid="reveal-sides">
    <li data-testid="reveal-side-opponent">
      <PlayerSide
        localiser={l}
        who="opponent"
        character={null}
        initiative={null}
        targets={null}
        placed={opponentPlaced ?? 'choosing'}
      />
    </li>
    {#if myPlan !== null}
      <li data-testid="reveal-side-you">
        <PlayerSide
          localiser={l}
          who="you"
          character={myPlan.character}
          initiative={myInitiative}
          targets={myPlan.targets}
          placed={null}
        />
      </li>
    {/if}
  </ul>

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
            <span class="muted">{l.t('reveal-initiative-label', { character: myCharacter })}</span>
            <b
              >{l.t('reveal-initiative-change', {
                printed: initiative(myCharacter),
                effective,
              })}</b
            >
          </p>
          <p role="status" class="visually-hidden" data-testid="effective-initiative">
            {l.t('reveal-initiative', {
              character: myCharacter,
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

  /* Side by side while both fit; otherwise one per row, their cards drawn smaller. */
  .sides {
    container-type: inline-size;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .sides > li {
    flex: 1 1 0;
    margin: 0;
    min-width: 0;
  }

  @container (width < 19rem) {
    .sides > li {
      flex-basis: 100%;
    }

    .sides :global(.side > .slot) {
      zoom: 0.75;
    }
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
