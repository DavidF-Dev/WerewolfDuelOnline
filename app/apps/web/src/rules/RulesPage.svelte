<script lang="ts">
  import { untrack } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import Button from '../components/Button.svelte';
  import MarkerIcon from '../components/MarkerIcon.svelte';
  import Label from '../kit/Label.svelte';
  import Panel from '../kit/Panel.svelte';
  import RichText from '../kit/RichText.svelte';
  import StepNumber from '../kit/StepNumber.svelte';
  import CharactersSection from './CharactersSection.svelte';
  import { RULES_SECTIONS, RULES_TEXT, neighbours, type RulesSection } from './sections.js';
  import { rulesParts } from './text.js';

  interface Props {
    localiser: Localiser;
    section: RulesSection;
    /** Asks for another section to be shown. */
    onNavigate: (section: RulesSection) => void;
    /** Whether the page shows the section's name, which a screen showing it in its bar leaves out. */
    titled?: boolean;
  }

  let { localiser: l, section, onNavigate, titled = true }: Props = $props();

  const near = $derived(neighbours(section));
  const blocks = $derived(section === 'characters' ? [] : RULES_TEXT[section]);
  const title = (s: RulesSection): string => l.t(`rules-${s}-title`);

  // Parts are headed one level below the page's own heading, or the bar's when it has none.
  const partLevel = $derived(titled ? 'h3' : 'h2');

  let heading = $state<HTMLElement>();

  /** Moves focus to the page's heading without scrolling to it. */
  export function focusHeading(): void {
    heading?.focus({ preventScroll: true });
  }
  // A page shown in place of another, as in a sheet, moves focus to its new heading.
  let shown = untrack(() => section);
  $effect(() => {
    if (section === shown) return;
    shown = section;
    heading?.focus();
  });
</script>

<div class="rules-page" data-testid="rules-page" data-section={section}>
  <Panel>
    <div data-testid="rules-progress">
      <Label as="p"
        >{l.t('rules-progress', {
          index: RULES_SECTIONS.indexOf(section) + 1,
          total: RULES_SECTIONS.length,
        })}</Label
      >
    </div>
    {#if titled}<h2 class="page-title" tabindex="-1" bind:this={heading}>{title(section)}</h2>{/if}
    {#if section === 'characters'}
      <p>{l.t('reference-characters-intro')}</p>
    {/if}
    {#each blocks as block, i (i)}
      {#if block.kind === 'paragraph'}
        <p><RichText parts={rulesParts(l, block.id)} /></p>
      {:else if block.kind === 'list'}
        <ul>
          {#each block.items as item (item)}
            <li><RichText parts={rulesParts(l, item)} /></li>
          {/each}
        </ul>
      {:else if block.kind === 'steps'}
        <ol class="parts" data-testid="rules-steps">
          {#each block.steps as step, n (step.title)}
            <li class="step">
              <StepNumber n={n + 1} />
              <div class="words">
                <svelte:element this={partLevel} class="part-title"
                  >{l.t(step.title)}</svelte:element
                >
                {#each step.paragraphs as paragraph (paragraph)}
                  <p><RichText parts={rulesParts(l, paragraph)} /></p>
                {/each}
              </div>
            </li>
          {/each}
        </ol>
      {:else if block.kind === 'points'}
        <ul class="parts">
          {#each block.points as point (point.title)}
            <li class="point">
              <svelte:element this={partLevel} class="part-title"
                ><RichText parts={rulesParts(l, point.title)} /></svelte:element
              >
              {#each point.paragraphs as paragraph (paragraph)}
                <p><RichText parts={rulesParts(l, paragraph)} /></p>
              {/each}
            </li>
          {/each}
        </ul>
      {:else}
        <dl class="markers" data-testid="rules-markers">
          {#each block.markers as marker (marker)}
            <div class="marker-row">
              <dt><MarkerIcon {marker} label={l.t(`marker-${marker}`)} /></dt>
              <dd><RichText parts={rulesParts(l, `rules-markers-${marker}`)} /></dd>
            </div>
          {/each}
        </dl>
      {/if}
    {/each}
  </Panel>
  {#if section === 'characters'}
    <CharactersSection localiser={l} level={partLevel} />
  {/if}
  <nav class="pages" aria-label={l.t('rules-pages')}>
    {#if near.previous !== null}
      {@const to = near.previous}
      <Button data-testid="rules-previous" onclick={() => onNavigate(to)}
        ><span class="direction">{l.t('rules-previous')}</span><span class="to">{title(to)}</span
        ></Button
      >
    {/if}
    {#if near.next !== null}
      {@const to = near.next}
      <Button variant="primary" data-testid="rules-next" onclick={() => onNavigate(to)}
        ><span class="direction">{l.t('rules-next')}</span><span class="to">{title(to)}</span
        ></Button
      >
    {/if}
  </nav>
</div>

<style>
  .rules-page {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .page-title {
    font-size: 1.25rem;
    font-weight: 400;
    margin: 0 0 8px;
  }

  .part-title {
    font-size: 0.9375rem;
    margin: 0 0 4px;
  }

  p,
  ul,
  dl {
    margin: 0 0 8px;
  }

  p:last-child,
  ul:last-child,
  dl:last-child {
    margin-bottom: 0;
  }

  .parts {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .parts > li {
    border-top: 1px solid var(--line);
    margin: 0;
    padding: 8px 0;
  }

  .parts > li:last-child {
    padding-bottom: 0;
  }

  .step {
    display: flex;
    gap: 10px;
  }

  .words {
    min-width: 0;
  }

  .marker-row {
    border-top: 1px solid var(--line);
    padding: 8px 0;
  }

  .marker-row:last-child {
    padding-bottom: 0;
  }

  dt {
    margin: 0 0 2px;
  }

  dd {
    margin: 0;
  }

  .pages {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .pages > :global(.kit-button) {
    flex: 1 1 8rem;
    flex-direction: column;
    gap: 2px;
  }

  .direction {
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1.25;
  }

  .to {
    line-height: 1.25;
  }
</style>
