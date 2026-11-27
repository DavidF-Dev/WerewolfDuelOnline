<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import Screen from '../components/Screen.svelte';
  import { navigate } from '../router.js';
  import RulesPage from '../rules/RulesPage.svelte';
  import { rulesHref, type RulesSection } from '../rules/sections.js';

  interface Props {
    localiser: Localiser;
    section: RulesSection;
  }

  let { localiser: l, section }: Props = $props();
</script>

<Screen
  title={l.t(`rules-${section}-title`)}
  testId="rules"
  back={l.t('back')}
  onback={() => navigate('how-to-play')}
>
  <RulesPage
    localiser={l}
    {section}
    titled={false}
    onNavigate={(to) => (location.hash = rulesHref(to))}
  />
</Screen>
