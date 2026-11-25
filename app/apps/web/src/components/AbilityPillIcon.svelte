<script lang="ts">
  import type { AbilityPill } from '../cards.js';
  import { artSymbol } from '../themes/resolve.js';
  import MarkerIcon from './MarkerIcon.svelte';

  interface Props {
    /** One item of a card's ability row, drawn as decoration; its meaning is given in words elsewhere. */
    pill: AbilityPill;
  }

  let { pill }: Props = $props();
  const THEME = 'placeholder';
</script>

{#snippet shape(href: string, kind: string)}
  <svg class="shape {kind}" focusable="false"><use {href} /></svg>
{/snippet}

{#if pill.kind === 'gain'}
  <MarkerIcon marker={pill.marker} ring="gain" />
{:else}
  <span
    class="pill"
    data-pill="attack"
    data-cost={pill.cost ?? undefined}
    data-targets={pill.targets.join(' ')}
    data-damage={pill.damage}
    aria-hidden="true"
  >
    {#if pill.cost !== null}
      <MarkerIcon marker={pill.cost} />
      <span class="spend" data-part="spend"
        >{@render shape(artSymbol(THEME, 'abilities', 'spend'), 'arrow')}</span
      >
    {/if}
    {#each pill.targets as target, i (i)}
      {#if target === 'any'}
        <span class="target" data-target="any"
          >{@render shape(artSymbol(THEME, 'factions', 'human'), 'human')}<span class="or">/</span
          >{@render shape(artSymbol(THEME, 'factions', 'werewolf'), 'werewolf')}</span
        >
      {:else}
        <span class="target" data-target={target}
          >{@render shape(artSymbol(THEME, 'factions', target), target)}</span
        >
      {/if}
    {/each}
    {#if pill.damage > 1}
      <span class="damage" data-part="damage"
        ><span class="sep">:</span>{#each { length: pill.damage }, i (i)}{@render shape(
            artSymbol(THEME, 'markers', 'health'),
            'heart',
          )}{/each}</span
      >
    {/if}
  </span>
{/if}

<style>
  .pill {
    align-items: center;
    background: color-mix(in srgb, var(--heart) 13%, var(--surface));
    border: var(--pill-border, 1.5px) solid color-mix(in srgb, var(--heart) 60%, transparent);
    border-radius: 999px;
    box-sizing: border-box;
    display: inline-flex;
    flex: none;
    font-size: var(--pill-font, 0.8125rem);
    font-weight: 700;
    gap: var(--pill-gap, 0.125rem);
    height: var(--pill-height, 1.625rem);
    line-height: var(--pill-line, 1.25rem);
    padding: var(--pill-pad, 0 0.5rem);
    white-space: nowrap;
  }

  .target,
  .damage,
  .spend {
    align-items: center;
    display: inline-flex;
  }

  .damage {
    gap: var(--pill-gap, 0.125rem);
  }

  .shape {
    fill: currentColor;
    flex: none;
    height: var(--shape-size, 0.9375rem);
    width: var(--shape-size, 0.9375rem);
  }

  .shape.human {
    color: var(--human);
  }

  .shape.werewolf {
    color: var(--werewolf);
  }

  .shape.heart,
  .shape.arrow {
    color: var(--heart);
  }

  .shape.arrow {
    height: var(--spend-size, 0.5625rem);
    margin: 0 0.0625rem;
    width: var(--spend-size, 0.5625rem);
  }

  .or,
  .sep {
    color: var(--muted);
    font-weight: 400;
    margin: 0 0.03125rem;
  }

  @media (forced-colors: active) {
    .pill {
      border-color: CanvasText;
    }

    .shape,
    .shape.human,
    .shape.werewolf,
    .shape.heart,
    .shape.arrow {
      color: CanvasText;
    }
  }
</style>
