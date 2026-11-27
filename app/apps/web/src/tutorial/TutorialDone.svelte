<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import Button from '../components/Button.svelte';
  import Screen from '../components/Screen.svelte';
  import Icon from '../kit/Icon.svelte';
  import Panel from '../kit/Panel.svelte';
  import RichText from '../kit/RichText.svelte';
  import { hrefFor } from '../router.js';
  import { rulesHref } from '../rules/sections.js';
  import { rulesParts } from '../rules/text.js';

  interface Props {
    localiser: Localiser;
    /** Starts the tutorial again from its first step. */
    onAgain: () => void;
    /** Leaves the tutorial for How to play. */
    onLeave: () => void;
  }

  let { localiser: l, onAgain, onLeave }: Props = $props();
  const uid = $props.id();

  const LEARNED = ['goal', 'plan', 'reveal', 'showdown'] as const;
</script>

<Screen title={l.t('tutorial-heading')} testId="tutorial-done" back={l.t('back')} onback={onLeave}>
  <Panel role="region" aria-labelledby="{uid}-heading">
    <h2 id="{uid}-heading" class="heading">{l.t('tutorial-done-heading')}</h2>
    <ul
      class="learned"
      aria-label={l.t('tutorial-done-learned')}
      data-testid="tutorial-done-learned"
    >
      {#each LEARNED as id (id)}
        <li>
          <span class="tick"><Icon name="tick" /></span>
          <span><RichText parts={rulesParts(l, `tutorial-done-${id}`)} /></span>
        </li>
      {/each}
    </ul>
    <p class="more">{l.t('tutorial-done-more')}</p>
  </Panel>
  <Button variant="primary" href={hrefFor('online-new')} data-testid="tutorial-done-play"
    >{l.t('tutorial-done-play')}</Button
  >
  <Button href={rulesHref('goal')} data-testid="tutorial-done-rules"
    >{l.t('tutorial-done-rules')}</Button
  >
  <Button data-testid="tutorial-done-again" onclick={onAgain}>{l.t('tutorial-done-again')}</Button>
</Screen>

<style>
  .heading {
    font-family: var(--font-label);
    font-size: 1.125rem;
    margin: 0 0 8px;
  }

  .learned {
    display: grid;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .learned li {
    align-items: flex-start;
    display: flex;
    gap: 8px;
    margin: 0;
  }

  .tick {
    color: var(--ok);
    flex: none;
    margin-top: 2px;
  }

  .more {
    color: var(--muted);
    font-size: 0.8125rem;
    margin: 10px 0 0;
  }
</style>
