<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Seat, View } from '@wwd/engine';
  import type { Localiser } from '@wwd/client-core';
  import ResignButton from '../components/ResignButton.svelte';
  import DescribeTable from './DescribeTable.svelte';

  interface Props {
    localiser: Localiser;
    view: View;
    seat: Seat;
    canResign: boolean;
    onResign: () => void;
    /** Asks for a pause once the round ends; the item is left out while this is undefined. */
    onPause?: () => void;
    /** Extra items, such as continuing on another device. */
    children?: Snippet;
  }

  let { localiser: l, view, seat, canResign, onResign, onPause, children }: Props = $props();
</script>

<details class="menu" data-testid="game-menu">
  <summary data-testid="game-menu-toggle">{l.t('menu-summary')}</summary>
  <ul class="items">
    {#if onPause !== undefined}
      <li>
        <button type="button" data-testid="pause-after-round" onclick={onPause}
          >{l.t('menu-pause')}</button
        >
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
</details>

<style>
  .menu {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 0 0.75rem;
  }

  summary {
    cursor: pointer;
    font-weight: 700;
    padding-block: 0.625rem;
  }

  .items {
    display: grid;
    gap: 0.75rem;
    list-style: none;
    margin: 0 0 0.75rem;
    padding: 0;
  }

  .items li {
    margin: 0;
  }
</style>
