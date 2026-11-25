<script lang="ts" module>
  import type { AbilityPill } from '../cards.js';

  type Row = 'gain' | 'attack' | 'damage' | 'spend';

  /** Each legend row and the pill it explains. */
  const ROWS: readonly (readonly [Row, AbilityPill])[] = [
    ['gain', { kind: 'gain', marker: 'hourglass' }],
    ['attack', { kind: 'attack', cost: null, targets: ['werewolf'], damage: 1 }],
    ['damage', { kind: 'attack', cost: null, targets: ['werewolf'], damage: 2 }],
    ['spend', { kind: 'attack', cost: 'cross', targets: ['werewolf', 'werewolf'], damage: 1 }],
  ];

  const SHAPES = ['werewolf', 'human', 'any'] as const;
</script>

<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import Label from '../kit/Label.svelte';
  import { artSymbol } from '../themes/resolve.js';
  import AbilityPillIcon from './AbilityPillIcon.svelte';

  interface Props {
    localiser: Localiser;
    /** The title's heading level: h3 inside a titled region, or h2 for a panel of its own. */
    level?: 'h2' | 'h3';
  }

  let { localiser: l, level = 'h3' }: Props = $props();
  const uid = $props.id();
</script>

{#snippet faction(id: 'human' | 'werewolf')}
  <svg class="shape {id}" aria-hidden="true" focusable="false"
    ><use href={artSymbol('placeholder', 'factions', id)} /></svg
  >
{/snippet}

<section class="legend" aria-labelledby="{uid}-heading" data-testid="ability-legend">
  <Label as={level} id="{uid}-heading">{l.t('legend-heading')}</Label>
  <dl>
    {#each ROWS as [row, pill] (row)}
      <div class="row" data-legend={row}>
        <dt>
          <span class="sample" aria-hidden="true"><AbilityPillIcon {pill} /></span>
          <span class="visually-hidden">{l.t(`legend-${row}`)}</span>
        </dt>
        <dd>
          {l.t(`legend-${row}-text`)}
          {#if row === 'attack'}
            <ul class="key">
              {#each SHAPES as shape (shape)}
                <li data-shape={shape}>
                  {#if shape === 'any'}
                    {@render faction('human')}<span class="or" aria-hidden="true">/</span
                    >{@render faction('werewolf')}
                  {:else}
                    {@render faction(shape)}
                  {/if}
                  {l.t(`legend-shape-${shape}`)}
                </li>
              {/each}
            </ul>
          {/if}
        </dd>
      </div>
    {/each}
  </dl>
</section>

<style>
  dl {
    align-items: start;
    display: grid;
    gap: 0.5rem 0.75rem;
    grid-template-columns: auto 1fr;
    margin: 0;
  }

  .row {
    display: contents;
  }

  /* One line tall, so the sample is centred on the first line of its text. */
  dt {
    align-items: center;
    display: flex;
    height: 1lh;
    justify-self: start;
  }

  .sample {
    --token-size: 1.25rem;
    --gain-size: 1.375rem;
    display: inline-flex;
  }

  dd {
    margin: 0;
  }

  .key {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.75rem;
    list-style: none;
    margin: 0.125rem 0 0;
    padding: 0;
  }

  .key li {
    margin: 0;
    white-space: nowrap;
  }

  .shape {
    fill: currentColor;
    height: 0.875rem;
    margin-inline-end: 0.125rem;
    vertical-align: -0.125rem;
    width: 0.875rem;
  }

  .shape.human {
    color: var(--human);
  }

  .shape.werewolf {
    color: var(--werewolf);
  }

  .or {
    color: var(--muted);
    margin-inline-end: 0.125rem;
  }

  @media (forced-colors: active) {
    .shape,
    .shape.human,
    .shape.werewolf {
      color: CanvasText;
    }
  }
</style>
