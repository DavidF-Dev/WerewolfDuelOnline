<script lang="ts">
  import { onMount } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import { getDeviceStore } from '../device-store.js';
  import { hrefFor } from '../router.js';
  import Button from '../components/Button.svelte';
  import Screen from '../components/Screen.svelte';
  import Icon from '../kit/Icon.svelte';
  import Panel from '../kit/Panel.svelte';
  import RichText from '../kit/RichText.svelte';
  import StepNumber from '../kit/StepNumber.svelte';
  import { RULES_SECTIONS, rulesHref } from '../rules/sections.js';
  import { rulesParts } from '../rules/text.js';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();

  // Until the settings are read, the panel offers the tutorial as to a newcomer.
  let tutorialFinished = $state(false);
  onMount(() => {
    let active = true;
    getDeviceStore()
      ?.settings.get()
      .then(
        (settings) => {
          if (active) tutorialFinished = settings.tutorialFinished;
        },
        () => {
          // Without the settings the panel stays as it is.
        },
      );
    return () => {
      active = false;
    };
  });
</script>

<Screen title={l.t('how-to-play-heading')} testId="how-to-play" back={l.t('back')}>
  <Panel
    title={l.t(
      tutorialFinished ? 'how-to-play-tutorial-done-heading' : 'how-to-play-tutorial-heading',
    )}
    data-testid="how-to-play-tutorial"
  >
    <p class="lead">{l.t('how-to-play-tutorial-text')}</p>
    <Button
      variant={tutorialFinished ? 'default' : 'primary'}
      href={hrefFor('tutorial')}
      data-testid="how-to-play-start-tutorial"
      >{l.t(tutorialFinished ? 'how-to-play-tutorial-again' : 'how-to-play-start-tutorial')}</Button
    >
  </Panel>
  <Panel title={l.t('how-to-play-rules-heading')}>
    <ol class="sections" data-testid="rules-sections">
      {#each RULES_SECTIONS as section, i (section)}
        <li>
          <a class="row" href={rulesHref(section)} data-testid="rules-section-{section}">
            <StepNumber n={i + 1} />
            <span class="words">
              <span class="title">{l.t(`rules-${section}-title`)}</span>
              <span class="summary"
                ><RichText parts={rulesParts(l, `rules-${section}-summary`)} /></span
              >
            </span>
            <span class="chevron"><Icon name="chevron" /></span>
          </a>
        </li>
      {/each}
    </ol>
  </Panel>
</Screen>

<style>
  .lead {
    margin: 0 0 10px;
  }

  .sections {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .sections > li {
    border-bottom: 1px solid var(--line);
    margin: 0;
  }

  .sections > li:last-child {
    border-bottom: 0;
  }

  .row {
    align-items: center;
    border-radius: 8px;
    color: var(--ink);
    display: flex;
    gap: 10px;
    min-height: var(--target);
    padding: 8px 2px;
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .row:hover {
      background: var(--hover-bg);
    }
  }

  .words {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
  }

  .title {
    font-weight: 700;
  }

  .summary {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .chevron {
    color: var(--muted);
    flex: none;
  }
</style>
