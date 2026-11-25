<script lang="ts">
  import { onDestroy, tick, type Component } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import { trackStaging, type Act, type Stage } from './stage.js';

  interface Props {
    localiser: Localiser;
    /** The real screen or component to show. */
    screen: Component<any>;
    /** Its props besides the localiser, built once the stage is set. */
    props?: () => Record<string, unknown>;
    stage?: Stage;
    act?: Act;
  }

  let { localiser, screen: Shown, props, stage, act }: Props = $props();

  let shownProps = $state.raw<Record<string, unknown> | null>(null);
  let undo: (() => void) | void;

  trackStaging(async () => {
    undo = await stage?.();
    shownProps = props?.() ?? {};
    await tick();
    await act?.(localiser);
  });

  onDestroy(() => undo?.());
</script>

{#if shownProps !== null}
  <Shown {localiser} {...shownProps} />
{/if}
