<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Seat, View } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import Button from '../components/Button.svelte';
  import ResignButton from '../components/ResignButton.svelte';
  import UnofficialNotice from '../components/UnofficialNotice.svelte';
  import Sheet from '../kit/Sheet.svelte';
  import DescribeTable from './DescribeTable.svelte';

  interface Props {
    localiser: Localiser;
    view: View;
    seat: Seat;
    canResign: boolean;
    onResign: () => void;
    /** Asks for a pause once the round ends; the item is left out while this is undefined. */
    onPause?: () => void;
    /** Closes the menu. */
    onclose: () => void;
    /** Extra items, such as continuing on another device. */
    children?: Snippet;
  }

  let {
    localiser: l,
    view,
    seat,
    canResign,
    onResign,
    onPause,
    onclose,
    children,
  }: Props = $props();
</script>

<Sheet title={l.t('menu-summary')} closeLabel={l.t('sheet-close')} {onclose} testId="game-menu">
  <ul class="items">
    {#if onPause !== undefined}
      <li>
        <Button data-testid="pause-after-round" onclick={onPause}>{l.t('menu-pause')}</Button>
      </li>
    {/if}
    {#if children !== undefined}
      <li>{@render children()}</li>
    {/if}
    <li><DescribeTable localiser={l} {view} {seat} /></li>
    {#if canResign}
      <li><ResignButton localiser={l} {onResign} /></li>
    {/if}
  </ul>
  <UnofficialNotice localiser={l} placement="inline" />
</Sheet>

<style>
  .items {
    display: grid;
    gap: 8px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .items li {
    margin: 0;
  }
</style>
