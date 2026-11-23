<script lang="ts">
  import { showdownOrder, type Event, type Seat, type View } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import { characterName } from '../text.js';

  interface Props {
    localiser: Localiser;
    view: View;
    /** The event log, for the effective initiatives the engine announced at this round's reveal. */
    events: Array<[number, Event]>;
    /** How each seat is named in the track. */
    names: Record<Seat, string>;
  }

  let { localiser: l, view, events, names }: Props = $props();
  const uid = $props.id();

  const index = (seat: Seat): 0 | 1 => (seat === 'p0' ? 0 : 1);

  /** The effective initiatives from this round's reveal, or null when that event isn't held. */
  const effective = $derived.by((): [number, number] | null => {
    for (let i = events.length - 1; i >= 0; i--) {
      const kind = events[i]![1].kind;
      if ('plans_revealed' in kind) return kind.plans_revealed.effective;
      if ('round_started' in kind || 'segment_started' in kind) return null;
    }
    return null;
  });

  const entries = $derived(
    (showdownOrder(view) ?? []).flatMap((seat, i) => {
      const plan = view.players[index(seat)].plan;
      if (typeof plan !== 'object' || !('revealed' in plan)) return [];
      const args = {
        position: i + 1,
        name: names[seat],
        character: characterName(l, plan.revealed.character),
      };
      const text =
        effective === null
          ? l.t('initiative-entry-unknown', args)
          : l.t('initiative-entry', { ...args, initiative: effective[index(seat)] });
      return [{ seat, text }];
    }),
  );
</script>

{#if entries.length > 0}
  <section aria-labelledby="{uid}-heading" data-testid="initiative-track">
    <h3 id="{uid}-heading">{l.t('initiative-heading')}</h3>
    <ol class="track">
      {#each entries as entry (entry.seat)}
        <li data-testid="initiative-{entry.seat}">{entry.text}</li>
      {/each}
    </ol>
  </section>
{/if}

<style>
  h3 {
    font-size: 1rem;
    margin: 0 0 0.25rem;
  }

  .track {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .track li {
    background: var(--chip);
    border-radius: var(--radius-small);
    margin: 0;
    padding: 0.25rem 0.75rem;
  }
</style>
