<script lang="ts" module>
  export type CardState = 'normal' | 'selected' | 'disabled' | 'ruled-out';
  export type CardFaction = 'human' | 'werewolf' | 'neutral';
</script>

<script lang="ts">
  import { display } from '../settings/display.svelte.js';
  import { resolveArt, type CardArtId } from '../themes/resolve.js';

  interface Props {
    /** The full accessible name. */
    label: string;
    /** The name printed on the card. */
    name: string;
    faction: CardFaction;
    /** The initiative shown in the corner, or null for a card without one. */
    initiative: number | null;
    art: CardArtId;
    state?: CardState;
    /** Why the card can't be chosen, shown and announced while it is disabled. */
    reason?: string;
    /** A short status shown under the card and announced with it, such as a deduction mark. */
    mark?: string;
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
    state = 'normal',
    reason,
    mark,
    onselect,
    toggle = true,
    testId,
  }: Props = $props();
  const uid = $props.id();

  const SILHOUETTES: Record<CardFaction, string> = {
    human: 'M14 3H86Q97 3 97 14V106Q97 123 50 137Q3 123 3 106V14Q3 3 14 3Z',
    werewolf: 'M3 3H68L76 12L84 3H97V30L88 36L97 42V137H32L24 128L16 137H3V110L12 104L3 98Z',
    neutral: 'M28 3H72L97 28V112L72 137H28L3 112V28Z',
  };

  const disabled = $derived(state === 'disabled');
  const hatched = $derived(display.colourBlindPatterns && faction === 'werewolf');
  const textOnly = $derived(display.cardText === 'text-only');
  const showReason = $derived(disabled && reason !== undefined);
  const describedBy = $derived(
    [showReason ? `${uid}-reason` : null, mark === undefined ? null : `${uid}-mark`]
      .filter((id) => id !== null)
      .join(' ') || undefined,
  );

  function select(): void {
    if (!disabled) onselect?.();
  }
</script>

<span class="slot">
  <button
    type="button"
    class="card {faction}"
    class:selected={state === 'selected'}
    class:disabled
    class:ruled-out={state === 'ruled-out'}
    aria-label={label}
    aria-pressed={onselect === undefined || !toggle ? undefined : state === 'selected'}
    aria-disabled={disabled ? 'true' : undefined}
    aria-describedby={describedBy}
    data-testid={testId}
    onclick={select}
  >
    <svg class="shape" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
      {#if hatched}
        <defs>
          <pattern
            id="{uid}-hatch"
            patternUnits="userSpaceOnUse"
            width="9"
            height="9"
            patternTransform="rotate(45)"
          >
            <rect width="9" height="9" fill="var(--card-fill)" />
            <rect width="3" height="9" fill="var(--card-hatch)" />
          </pattern>
        </defs>
      {/if}
      <path
        data-part="silhouette"
        d={SILHOUETTES[faction]}
        fill={hatched ? `url(#${uid}-hatch)` : 'var(--card-fill)'}
        stroke="var(--card-edge)"
        stroke-width="3"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    {#if initiative !== null}
      <span class="initiative" data-part="initiative" aria-hidden="true">{initiative}</span>
    {/if}
    {#if textOnly}
      <span class="name name-only" aria-hidden="true">{name}</span>
    {:else}
      <span
        class="glyph"
        data-part="glyph"
        aria-hidden="true"
        style:mask-image={`url("${resolveArt('placeholder', 'cards', art)}")`}
      ></span>
      <span class="name" aria-hidden="true">{name}</span>
    {/if}
    {#if state === 'ruled-out'}
      <svg class="strike" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M12 18 88 122M88 18 12 122"
          stroke="var(--ink)"
          stroke-width="4"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    {/if}
    {#if state === 'selected'}
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
  </button>
  {#if showReason}
    <span id="{uid}-reason" class="note reason">{reason}</span>
  {/if}
  {#if mark !== undefined}
    <span id="{uid}-mark" class="mark">{mark}</span>
  {/if}
</span>

<style>
  .slot {
    display: inline-flex;
    flex-direction: column;
    gap: 0.25rem;
    max-width: 6rem;
  }

  .mark {
    font-size: 0.875rem;
    font-weight: 700;
  }

  .card {
    --card-fill: var(--surface);
    --card-edge: var(--neutral);
    --card-hatch: color-mix(in srgb, var(--card-edge) 30%, var(--surface));
    aspect-ratio: 100 / 140;
    background: none;
    border: 0;
    border-radius: var(--radius);
    color: var(--ink);
    display: block;
    padding: 0;
    position: relative;
    transition: translate var(--motion-fast) ease-out;
    width: 5.5rem;
  }

  .card.human {
    --card-edge: var(--human);
  }

  .card.werewolf {
    --card-edge: var(--werewolf);
  }

  .card:hover:not(.disabled) {
    background: none;
  }

  .card.selected {
    font-weight: normal;
    outline: var(--focus-width) solid var(--accent);
    outline-offset: 3px;
    translate: 0 -0.25rem;
  }

  .card:focus-visible {
    outline: var(--focus-width) solid var(--focus);
    outline-offset: 3px;
  }

  .card.disabled {
    border-style: none;
  }

  .card.disabled > :not(.shape) {
    opacity: 0.45;
  }

  .card.disabled::after {
    background: linear-gradient(
      to top right,
      transparent 48%,
      var(--muted) 49% 51%,
      transparent 52%
    );
    content: '';
    inset: 0;
    position: absolute;
  }

  .card.ruled-out .name {
    text-decoration: line-through;
    text-decoration-thickness: 2px;
  }

  .card.ruled-out > :not(.shape, .strike) {
    opacity: 0.6;
  }

  .shape,
  .strike {
    height: 100%;
    inset: 0;
    position: absolute;
    width: 100%;
  }

  .initiative {
    font: 700 1.5rem/1 var(--font-display);
    left: 0.6rem;
    position: absolute;
    top: 0.55rem;
  }

  .glyph {
    background: var(--card-edge);
    height: 2.25rem;
    left: 50%;
    mask-position: center;
    mask-repeat: no-repeat;
    mask-size: contain;
    position: absolute;
    top: 45%;
    translate: -50% -50%;
    width: 2.25rem;
  }

  .name {
    bottom: 1.4rem;
    font-size: 0.75rem;
    font-weight: 700;
    left: 0.4rem;
    line-height: 1.1;
    position: absolute;
    right: 0.4rem;
    text-align: center;
  }

  .name-only {
    bottom: auto;
    font-size: 0.875rem;
    top: 50%;
    translate: 0 -50%;
  }

  .tick {
    height: 1.5rem;
    position: absolute;
    right: -0.5rem;
    top: -0.5rem;
    width: 1.5rem;
  }
</style>
