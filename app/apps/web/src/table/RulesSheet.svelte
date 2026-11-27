<script lang="ts">
  import { tick } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import Sheet from '../kit/Sheet.svelte';
  import RulesPage from '../rules/RulesPage.svelte';
  import type { RulesSection } from '../rules/sections.js';

  interface Props {
    localiser: Localiser;
    /** Whether the rules are shown over the table. */
    open: boolean;
    /** Closes the sheet. */
    onclose: () => void;
  }

  let { localiser: l, open, onclose }: Props = $props();

  /** Where the rules open in a game. */
  const START: RulesSection = 'round';
  let section = $state<RulesSection>(START);
  let page = $state<HTMLElement>();
  let rules = $state<ReturnType<typeof RulesPage>>();

  // Each time it opens, the sheet shows START from the top, with focus on the heading, not a button.
  $effect(() => {
    if (!open) {
      section = START;
      return;
    }
    void tick().then(() => {
      rules?.focusHeading();
      const sheet = page?.closest('dialog');
      if (sheet) sheet.scrollTop = 0;
    });
  });
</script>

{#if open}
  <Sheet
    title={l.t('rules-sheet-title')}
    closeLabel={l.t('sheet-close')}
    {onclose}
    testId="rules-sheet"
  >
    <div bind:this={page}>
      <RulesPage bind:this={rules} localiser={l} {section} onNavigate={(to) => (section = to)} />
    </div>
  </Sheet>
{/if}
