<script lang="ts">
  import { effectiveInitiative, type Command, type Seat, type View } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { initiative } from '../cards.js';
  import Button from '../components/Button.svelte';
  import CharacterCard from '../components/CharacterCard.svelte';
  import { characterName, commandLabel } from '../text.js';
  import type { SequencedEvent } from './showdown.js';

  interface Props {
    localiser: Localiser;
    view: View;
    seat: Seat;
    events: SequencedEvent[];
    legal: Command[];
    onCommand: (cmd: Command) => void;
    /** Changes whenever the referee reports a problem, which frees a sent command for a retry. */
    errorCount?: number;
  }

  let { localiser: l, view, seat, events, legal, onCommand, errorCount = 0 }: Props = $props();
  const uid = $props.id();

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

  const myPlan = $derived(view.players[seat === 'p0' ? 0 : 1].plan);
  const myCharacter = $derived(
    typeof myPlan === 'object' && 'revealed' in myPlan ? myPlan.revealed.character : null,
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
</script>

<section aria-labelledby="{uid}-heading" class="reveal" data-testid="reveal">
  <h2 id="{uid}-heading">{l.t('reveal-heading')}</h2>
  {#if opponentPlaced !== null}
    <p data-testid="opponent-hourglasses">{l.t('reveal-opponent-placed', { n: opponentPlaced })}</p>
  {/if}

  {#if chosen !== undefined}
    <div class="hourglasses" role="group" aria-labelledby="{uid}-hourglasses">
      <h3 id="{uid}-hourglasses">{l.t('reveal-hourglasses-heading')}</h3>
      <div class="stepper">
        <button
          type="button"
          aria-label={l.t('reveal-fewer')}
          aria-disabled={index === 0}
          aria-controls="{uid}-count"
          data-testid="hourglass-fewer"
          onclick={() => step(-1)}>−</button
        >
        <output
          id="{uid}-count"
          class="count"
          data-testid="hourglass-count"
          data-value={chosen.place_hourglasses.n}>{chosen.place_hourglasses.n}</output
        >
        <button
          type="button"
          aria-label={l.t('reveal-more')}
          aria-disabled={index === places.length - 1}
          aria-controls="{uid}-count"
          data-testid="hourglass-more"
          onclick={() => step(1)}>+</button
        >
      </div>
      {#if myCharacter !== null}
        <p role="status" data-testid="effective-initiative">
          {l.t('reveal-initiative', {
            character: characterName(l, myCharacter),
            effective: effectiveInitiative(myCharacter, chosen.place_hourglasses.n),
            printed: initiative(myCharacter),
          })}
        </p>
      {/if}
      <p>
        <Button
          variant="primary"
          aria-disabled={sent}
          data-testid="place-hourglasses"
          data-phase-focus
          onclick={() => send(chosen)}>{commandLabel(l, chosen)}</Button
        >
      </p>
    </div>
  {/if}

  {#if potion.length > 0}
    <section aria-labelledby="{uid}-potion" data-testid="potion-picker">
      <h3 id="{uid}-potion">{l.t('reveal-potion-heading')}</h3>
      <ul class="cards">
        {#each potion as cmd (cmd.choose_potion_target.card)}
          <li>
            <CharacterCard
              localiser={l}
              character={cmd.choose_potion_target.card}
              toggle={false}
              testId="action-potion-{cmd.choose_potion_target.card}"
              onselect={() => send(cmd)}
            />
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</section>

<style>
  .reveal {
    display: grid;
    gap: 0.5rem;
  }

  h2 {
    font-size: 1.125rem;
    margin: 0;
  }

  h3 {
    font-size: 1rem;
    margin: 0 0 0.25rem;
  }

  p {
    margin: 0;
  }

  .hourglasses {
    display: grid;
    gap: 0.5rem;
  }

  .stepper {
    align-items: center;
    display: flex;
    gap: 0.75rem;
  }

  .stepper button {
    font-size: 1.5rem;
    line-height: 1;
    min-inline-size: 2.75rem;
  }

  .count {
    font: 700 1.5rem/1 var(--font-display);
    min-inline-size: 2ch;
    text-align: center;
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
</style>
