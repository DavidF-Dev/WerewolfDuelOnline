<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import Screen from '../components/Screen.svelte';
  import { COPYRIGHT, FONT_CREDITS, OFL, SOFTWARE_CREDITS, THEME_CREDITS } from '../credits.js';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();
  const uid = $props.id();
</script>

<Screen title={l.t('about-heading')} testId="about" backLabel={l.t('back')}>
  <p>{l.t('about-version', { version: __APP_VERSION__ })}</p>
  <section aria-labelledby="{uid}-credits">
    <h2 id="{uid}-credits">{l.t('about-credits-heading')}</h2>
    <ul>
      {#each [...FONT_CREDITS, ...SOFTWARE_CREDITS] as credit (credit.name)}
        <li>{l.t('about-credit-line', { name: credit.name, licence: credit.licence })}</li>
      {/each}
      {#each THEME_CREDITS as credit (credit)}
        <li>{l.t('about-theme-credit', { credit })}</li>
      {/each}
    </ul>
  </section>
  <section aria-labelledby="{uid}-licences">
    <h2 id="{uid}-licences">{l.t('about-licences-heading')}</h2>
    <p>{l.t('about-fonts-notice', { licence: OFL })}</p>
  </section>
  <p>{COPYRIGHT}</p>
  <p data-testid="unofficial-notice">{l.t('footer-unofficial')}</p>
  <p>{l.t('footer-not-affiliated')}</p>
</Screen>
