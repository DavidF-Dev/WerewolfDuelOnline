<script lang="ts" module>
  export type CardState = 'normal' | 'selected' | 'disabled';
  export type { CardFaction, CardSize } from './CardFace.svelte';

  /** How long a pointer must be held on a smaller card to show it at large size. */
  const LONG_PRESS_MS = 500;
  /** The space kept between the popover and the card or the viewport's edge. */
  const POPOVER_GAP = 6;
</script>

<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import type { RichPart } from '@wwd/client-core';
  import type { AbilityPill } from '../cards.js';
  import type { CardArtId } from '../themes/resolve.js';
  import CardFace, { type CardFaction, type CardSize } from './CardFace.svelte';

  interface Props {
    /** The full accessible name. */
    label: string;
    /** The name printed on the card. */
    name: string;
    faction: CardFaction;
    /** The initiative shown in the corner, or null for a card without one. */
    initiative: number | null;
    art: CardArtId;
    /** What the card does, drawn as its ability row. */
    pills: readonly AbilityPill[];
    /** What the card does, in words, drawn on large and medium cards. */
    text: readonly RichPart[];
    size?: CardSize;
    state?: CardState;
    /** Why the card can't be chosen: announced while it is disabled, and shown on focus or a tap. */
    reason?: string;
    /** A description announced while the card is not disabled, such as why it is only shown. */
    description?: string;
    onselect?: () => void;
    /** Whether choosing the card toggles it on and off, rather than acting at once. */
    toggle?: boolean;
    testId?: string;
  }

  let {
    label,
    name,
    faction,
    initiative,
    art,
    pills,
    text,
    size = 'large',
    state: shownState = 'normal',
    reason,
    description,
    onselect,
    toggle = true,
    testId,
  }: Props = $props();
  const uid = $props.id();

  const disabled = $derived(shownState === 'disabled');
  const actionable = $derived(onselect !== undefined);
  const inspectable = $derived(size !== 'large');
  const showReason = $derived(disabled && reason !== undefined);
  const described = $derived(showReason ? reason : disabled ? undefined : description);
  // A target card that can't be chosen is drawn faded; a card of any other size is crossed out.
  const faded = $derived(disabled && size === 'target');

  let button = $state<HTMLButtonElement>();
  let open = $state(false);
  let reasonOpen = $state(false);
  let pointerUsed = false;
  let pressedLong = false;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;

  function select(event: MouseEvent): void {
    const afterLongPress = pressedLong;
    pressedLong = false;
    // A pointer's click ends the long press that opened the popover; a key's click still chooses.
    if (afterLongPress && event.detail > 0) return;
    if (disabled) reasonOpen = showReason;
    else onselect?.();
  }

  // A key press after a pointer press means the keyboard is in use, even if the card never took focus.
  function keyUsed(): void {
    pointerUsed = false;
  }

  function pressStart(event: PointerEvent): void {
    pointerUsed = true;
    document.addEventListener('keydown', keyUsed, { capture: true, once: true });
    if (!inspectable || event.button > 0) return;
    pressedLong = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      open = true;
      reasonOpen = showReason;
      pressedLong = true;
    }, LONG_PRESS_MS);
  }

  function pressEnd(): void {
    clearTimeout(pressTimer);
  }

  // Only keyboard focus opens the popover; some browsers focus a tapped button after the pointer is up.
  function focused(): void {
    if (pointerUsed || !button?.matches(':focus-visible')) return;
    if (inspectable) open = true;
    reasonOpen = showReason;
  }

  function close(): void {
    open = false;
    reasonOpen = false;
  }

  function blurred(): void {
    pointerUsed = false;
    close();
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !(open || reasonOpen)) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  $effect(() => {
    if (!open && !reasonOpen) return;
    const outside = (event: PointerEvent): void => {
      if (!(event.target instanceof Node && button?.contains(event.target))) close();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  });

  $effect(() => () => {
    clearTimeout(pressTimer);
    document.removeEventListener('keydown', keyUsed, { capture: true });
  });

  /**
   * Shows the popover in the top layer, above the card or below it when there is no room, inside
   * the viewport, and keeps it beside the card while the page scrolls or resizes.
   */
  const place: Attachment<HTMLElement> = (popover) => {
    if (typeof popover.showPopover !== 'function') return;
    // A zoomed card would draw its enlarged copy, and place it, at that zoom; the popover undoes it.
    const inherited = popover.parentElement?.currentCSSZoom ?? 1;
    if (inherited !== 1) popover.style.zoom = String(1 / inherited);
    popover.showPopover();
    let frame = 0;
    const position = (): void => {
      frame = 0;
      if (button === undefined) return;
      const card = button.getBoundingClientRect();
      const own = popover.getBoundingClientRect();
      const above = card.top - own.height - POPOVER_GAP;
      const top = above >= POPOVER_GAP ? above : card.bottom + POPOVER_GAP;
      const centred = card.left + card.width / 2 - own.width / 2;
      const left = Math.max(
        POPOVER_GAP,
        Math.min(centred, window.innerWidth - own.width - POPOVER_GAP),
      );
      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
    };
    const follow = (): void => {
      if (frame === 0) frame = requestAnimationFrame(position);
    };
    position();
    window.addEventListener('scroll', follow, { capture: true, passive: true });
    window.addEventListener('resize', follow, { passive: true });
    return () => {
      window.removeEventListener('scroll', follow, { capture: true });
      window.removeEventListener('resize', follow);
      cancelAnimationFrame(frame);
    };
  };
</script>

<span class="slot">
  <span
    class="frame card {size}"
    class:selected={shownState === 'selected'}
    class:disabled
    class:faded
    class:crossed={disabled && !faded}
    class:actionable
  >
    <!-- The face is drawn over the button, not inside it: the button's name says all the face shows. -->
    <button
      bind:this={button}
      type="button"
      class="hit"
      class:selected={shownState === 'selected'}
      class:disabled
      class:actionable
      aria-label={label}
      aria-pressed={onselect === undefined || !toggle ? undefined : shownState === 'selected'}
      aria-disabled={disabled ? 'true' : undefined}
      aria-describedby={described === undefined ? undefined : `${uid}-reason`}
      data-testid={testId}
      onclick={select}
      onfocus={focused}
      onblur={blurred}
      onkeydown={keydown}
      onpointerdown={pressStart}
      onpointerup={pressEnd}
      onpointercancel={pressEnd}
      onpointerleave={pressEnd}
      oncontextmenu={(event) => {
        if (inspectable) event.preventDefault();
      }}
    ></button>
    <CardFace {name} {faction} {initiative} {art} {size} {pills} {text} />
    {#if shownState === 'selected'}
      <svg class="tick" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="var(--accent)" />
        <path
          d="M6.5 12.5 10.5 16.5 17.5 8"
          fill="none"
          stroke="var(--accent-ink)"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    {/if}
    {#if open}
      <span class="popover" data-part="popover" aria-hidden="true" popover="manual" {@attach place}>
        <span class="popover-card">
          <CardFace {name} {faction} {initiative} {art} {pills} {text} />
        </span>
        {#if reasonOpen}<span class="bubble" data-part="reason">{reason}</span>{/if}
      </span>
    {:else if reasonOpen}
      <span class="popover" aria-hidden="true" popover="manual" {@attach place}>
        <span class="bubble" data-part="reason">{reason}</span>
      </span>
    {/if}
  </span>
  {#if described !== undefined}
    <span id="{uid}-reason" class="visually-hidden">{described}</span>
  {/if}
</span>

<style>
  .slot {
    display: inline-flex;
    flex-direction: column;
    gap: 0.25rem;
    max-width: var(--card-large-width);
  }

  .frame {
    align-self: flex-start;
  }

  .card {
    border-radius: 9px;
    display: block;
    height: var(--card-large-height);
    position: relative;
    transition:
      translate var(--motion-fast) ease-out,
      scale var(--motion-fast) ease-out,
      box-shadow var(--motion-fast) ease-out;
    width: var(--card-large-width);
  }

  .card > :global(:not(.hit, .popover)) {
    pointer-events: none;
  }

  .hit {
    background: none;
    border: 0;
    border-radius: inherit;
    inset: 0;
    padding: 0;
    position: absolute;
  }

  .card.medium {
    height: var(--card-medium-height);
    width: var(--card-medium-width);
  }

  .card.target {
    height: var(--card-target-height);
    width: var(--card-target-width);
  }

  .card.medium,
  .card.target {
    -webkit-touch-callout: none;
    touch-action: manipulation;
    user-select: none;
  }

  .hit:hover {
    background: none;
  }

  /* A card only on show does nothing on a click, though a long press or focus may inspect it. */
  .hit:not(.actionable, .disabled) {
    cursor: default;
  }

  /* The face covers the button, so the hover ring is drawn around the card. */
  @media (hover: hover) and (pointer: fine) {
    .card.actionable:not(.selected, .disabled):has(> .hit:hover) {
      box-shadow: 0 0 0 2px var(--hover-line);
    }
  }

  /* The frame's outline and the tick already show the choice. */
  .hit[aria-pressed='true']:not(:focus-visible) {
    outline: none;
  }

  .card.selected {
    font-weight: normal;
    outline: var(--focus-width) solid var(--accent);
    outline-offset: 2px;
    translate: 0 -0.25rem;
  }

  .card.medium.selected {
    translate: 0 -7px;
  }

  .card.target.selected {
    translate: none;
  }

  .hit:focus-visible {
    outline: var(--focus-width) solid var(--focus);
    outline-offset: 2px;
  }

  .card.crossed {
    --card-content-opacity: 0.45;
  }

  .card.crossed::after {
    background: linear-gradient(
      to top right,
      transparent 48%,
      var(--muted) 49% 51%,
      transparent 52%
    );
    content: '';
    inset: 0;
    pointer-events: none;
    position: absolute;
  }

  /* Scaled about its centre, so the cards around it keep their places. */
  .card.faded {
    --card-content-opacity: 0.6;
    scale: 0.9;
    transform-origin: center;
  }

  .card.faded > :global(.face) {
    border-color: color-mix(in srgb, var(--edge) 60%, var(--surface));
    box-shadow: none;
  }

  /* The name stays readable: the muted ink keeps 4.5:1 where 60 % opacity would not. */
  .card.faded > :global(.face > [data-part='top']) {
    opacity: 1;
  }

  .card.faded :global([data-part='name']) {
    color: var(--muted);
  }

  .tick {
    bottom: -0.45rem;
    height: 1.125rem;
    position: absolute;
    right: -0.45rem;
    width: 1.125rem;
  }

  .target .tick {
    bottom: auto;
    height: 1rem;
    right: 0.25rem;
    top: 2rem;
    width: 1rem;
  }

  .popover {
    --card-content-opacity: 1;
    background: none;
    border: 0;
    bottom: calc(100% + 6px);
    left: 50%;
    margin: 0;
    padding: 0;
    position: absolute;
    translate: -50% 0;
    z-index: 2;
  }

  .popover:popover-open {
    align-items: center;
    display: flex;
    flex-direction: column;
    gap: 4px;
    inset: auto;
    position: fixed;
    translate: none;
  }

  .bubble {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 2px 6px color-mix(in srgb, var(--ink) 25%, transparent);
    color: var(--ink);
    display: block;
    font-size: 0.75rem;
    line-height: 1.3;
    max-width: 14rem;
    padding: 5px 8px;
    text-align: center;
  }

  .popover-card {
    display: block;
    filter: drop-shadow(0 2px 6px color-mix(in srgb, var(--ink) 30%, transparent));
    height: var(--card-large-height);
    position: relative;
    width: var(--card-large-width);
  }
</style>
