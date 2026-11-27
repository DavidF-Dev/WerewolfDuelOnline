<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import IconButton from '../kit/IconButton.svelte';
  import Panel from '../kit/Panel.svelte';
  import { hrefFor } from '../router.js';
  import Button from './Button.svelte';

  interface Props {
    localiser: Localiser;
    onDismiss: () => void;
  }

  let { localiser: l, onDismiss }: Props = $props();
  const uid = $props.id();
</script>

<Panel role="region" aria-labelledby="{uid}-heading" data-testid="home-newcomer">
  <div class="head">
    <h2 id="{uid}-heading">{l.t('home-newcomer-heading')}</h2>
    <IconButton
      icon="close"
      label={l.t('home-newcomer-dismiss')}
      data-testid="home-newcomer-dismiss"
      onclick={onDismiss}
    />
  </div>
  <p class="text">{l.t('home-newcomer-text')}</p>
  <Button size="small" href={hrefFor('tutorial')} data-testid="home-newcomer-learn"
    >{l.t('home-newcomer-learn')}</Button
  >
</Panel>

<style>
  .head {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
  }

  h2 {
    font-family: var(--font-body);
    font-size: 0.9375rem;
    font-weight: 700;
    margin: 0;
  }

  .text {
    color: var(--muted);
    font-size: 0.75rem;
    margin: 4px 0 8px;
  }
</style>
