<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import Screen from '../components/Screen.svelte';
  import { COPYRIGHT, FONT_CREDITS, OFL, SOFTWARE_CREDITS, THEME_CREDITS } from '../credits.js';
  import ListRow from '../kit/ListRow.svelte';
  import Panel from '../kit/Panel.svelte';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();
</script>

<Screen title={l.t('about-heading')} testId="about" back={l.t('back')} tight>
  <Panel>
    <p class="version">{l.t('about-version', { version: __APP_VERSION__ })}</p>
    <p class="note">{COPYRIGHT}</p>
  </Panel>
  <Panel title={l.t('about-credits-heading')}>
    <ul class="rows">
      {#each [...FONT_CREDITS, ...SOFTWARE_CREDITS] as credit (credit.name)}
        <ListRow>{l.t('about-credit-line', { name: credit.name, licence: credit.licence })}</ListRow
        >
      {/each}
      {#each THEME_CREDITS as credit (credit)}
        <ListRow>{l.t('about-theme-credit', { credit })}</ListRow>
      {/each}
    </ul>
  </Panel>
  <Panel title={l.t('about-licences-heading')}>
    <p>{l.t('about-fonts-notice', { licence: OFL })}</p>
  </Panel>
  <Panel>
    <p data-testid="unofficial-notice">{l.t('footer-unofficial')}</p>
    <p class="note">{l.t('footer-not-affiliated')}</p>
  </Panel>
</Screen>

<style>
  p {
    margin: 0;
  }

  p + p {
    margin-top: 4px;
  }

  .version {
    font-weight: 600;
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }
</style>
