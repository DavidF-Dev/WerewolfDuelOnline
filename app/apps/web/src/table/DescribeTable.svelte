<script lang="ts">
  import { tick } from 'svelte';
  import type { Seat, View } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import Button from '../components/Button.svelte';
  import { describe } from './describe.js';

  interface Props {
    localiser: Localiser;
    view: View;
    seat: Seat;
  }

  let { localiser: l, view, seat }: Props = $props();
  let description = $state('');

  /** Writes the description into the status line, emptying it first so a repeat is read again. */
  async function read(): Promise<void> {
    const text = describe(view, seat, l);
    description = '';
    await tick();
    description = text;
  }
</script>

<div class="describe">
  <Button data-testid="describe-table" onclick={() => void read()}>{l.t('describe-button')}</Button>
  <p
    role="status"
    class={['description', { filled: description !== '' }]}
    data-testid="table-description"
  >
    {description}
  </p>
</div>

<style>
  .description {
    font-size: 0.8125rem;
    margin: 0;
    white-space: pre-line;
  }

  .filled {
    margin-top: 8px;
  }
</style>
