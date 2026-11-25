<script lang="ts" module>
  export interface MenuItem {
    label: string;
    onselect: () => void;
    'data-testid'?: string;
  }
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import type { IconName } from './Icon.svelte';
  import IconButton from './IconButton.svelte';

  interface Props {
    /** The button's accessible name. */
    label: string;
    icon?: IconName;
    items: readonly MenuItem[];
    'data-testid'?: string;
    /** The test id of the open menu. */
    menuTestId?: string;
    element?: HTMLButtonElement;
  }

  let {
    label,
    icon = 'more',
    items,
    'data-testid': testId,
    menuTestId,
    element = $bindable(),
  }: Props = $props();
  const uid = $props.id();
  let open = $state(false);
  // Opens upwards when there is no room below the button.
  let above = $state(false);
  let wrapper = $state<HTMLElement>();
  let menu = $state<HTMLElement>();

  const menuItems = (): HTMLElement[] =>
    Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  // The space the stylesheet leaves between the button and the menu.
  const GAP_PX = 4;

  /** Opens the menu upwards when it does not fit below its button but does above it. */
  function place(): void {
    if (menu === undefined || element === undefined) return;
    const needed = menu.offsetHeight + GAP_PX;
    const button = element.getBoundingClientRect();
    above = innerHeight - button.bottom < needed && button.top >= needed;
  }

  async function show(focus: 'first' | 'last'): Promise<void> {
    open = true;
    await tick();
    place();
    const all = menuItems();
    (focus === 'first' ? all[0] : all[all.length - 1])?.focus();
  }

  function hide(refocus: boolean): void {
    open = false;
    if (refocus) element?.focus();
  }

  function toggle(): void {
    if (open) hide(false);
    else void show('first');
  }

  function buttonKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    void show(event.key === 'ArrowDown' ? 'first' : 'last');
  }

  function menuKey(event: KeyboardEvent): void {
    const all = menuItems();
    const at = all.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      hide(true);
    } else if (event.key === 'Tab') {
      // Tab then moves on from the button, as if the menu had not been opened.
      hide(true);
    } else if (event.key === 'ArrowDown') next = (at + 1) % all.length;
    else if (event.key === 'ArrowUp') next = (at - 1 + all.length) % all.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = all.length - 1;
    if (next !== null) {
      event.preventDefault();
      all[next]?.focus();
    }
  }

  function select(item: MenuItem): void {
    hide(true);
    item.onselect();
  }

  function pointerDown(event: PointerEvent): void {
    if (open && !(event.target instanceof Node && wrapper?.contains(event.target) === true)) {
      hide(false);
    }
  }

  function focusOut(event: FocusEvent): void {
    const to = event.relatedTarget;
    if (open && to instanceof Node && wrapper?.contains(to) !== true) hide(false);
  }
</script>

<svelte:document onpointerdown={pointerDown} />
<svelte:window onresize={() => open && place()} onscroll={() => open && place()} />

<div class="menu-button" bind:this={wrapper} onfocusout={focusOut}>
  <IconButton
    {icon}
    {label}
    id="{uid}-button"
    data-testid={testId}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls={open ? `${uid}-menu` : undefined}
    bind:element
    onclick={toggle}
    onkeydown={buttonKey}
  />
  {#if open}
    <div
      id="{uid}-menu"
      class={['menu', { above }]}
      role="menu"
      tabindex="-1"
      aria-labelledby="{uid}-button"
      data-testid={menuTestId}
      bind:this={menu}
      onkeydown={menuKey}
    >
      {#each items as item (item.label)}
        <button
          type="button"
          class="item"
          role="menuitem"
          tabindex="-1"
          data-testid={item['data-testid']}
          onclick={() => select(item)}>{item.label}</button
        >
      {/each}
    </div>
  {/if}
</div>

<style>
  .menu-button {
    flex: none;
    position: relative;
  }

  .menu {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    inset-inline-end: 0;
    max-width: calc(100vw - 24px);
    padding: 4px;
    position: absolute;
    top: calc(100% + 4px);
    width: max-content;
    z-index: 10;
  }

  .menu.above {
    bottom: calc(100% + 4px);
    top: auto;
  }

  .item {
    background: transparent;
    border: 0;
    border-radius: 7px;
    color: var(--ink);
    font: inherit;
    font-size: 0.875rem;
    min-height: var(--target);
    padding: 8px 12px;
    text-align: start;
  }

  .item:focus-visible {
    background: var(--surface-2);
  }

  @media (hover: hover) and (pointer: fine) {
    .item:hover {
      background: var(--hover-bg);
    }
  }
</style>
