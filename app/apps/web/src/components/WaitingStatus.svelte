<script lang="ts" module>
  import type { ClientStatus } from '@wwd/client-core';

  /** Whether a status is still being waited for, has arrived, or has ended without arriving. */
  export type WaitState = 'waiting' | 'done' | 'ended';

  /** The wait a client status stands for: connecting and waiting for the opponent are waits. */
  export const waitStateOf = (status: ClientStatus): WaitState =>
    status === 'connecting' || status === 'waiting'
      ? 'waiting'
      : status === 'playing'
        ? 'done'
        : 'ended';
</script>

<script lang="ts">
  import Panel from '../kit/Panel.svelte';
  import Spinner from '../kit/Spinner.svelte';

  interface Props {
    /** The status, read out whenever it changes. */
    text: string;
    /** A spinner while waiting, a green dot once done, and no indicator once the wait has ended. */
    state: WaitState;
    testId: string;
  }

  let { text, state, testId }: Props = $props();
</script>

<div class="waiting">
  <Panel>
    {#if state === 'waiting'}
      <Spinner spaced={false} />
    {:else if state === 'done'}
      <span class="dot" aria-hidden="true"></span>
    {/if}
    <p class="text" role="status" data-testid={testId}>{text}</p>
  </Panel>
</div>

<style>
  .waiting > :global(.panel) {
    align-items: center;
    display: flex;
    gap: 8px;
  }

  .text {
    margin: 0;
  }

  .dot {
    background: var(--ok);
    border-radius: 50%;
    flex: none;
    height: 8px;
    width: 8px;
  }
</style>
