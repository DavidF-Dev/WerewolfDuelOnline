<script lang="ts">
  interface Props {
    /** The group's accessible name: what the value counts. */
    label: string;
    decreaseLabel: string;
    increaseLabel: string;
    value: number;
    min: number;
    max: number;
    onchange: (value: number) => void;
    /** Prefix for the test ids of the buttons (`-fewer`, `-more`) and the value (`-count`). */
    testId?: string;
    /** Whether the value is read out as it changes; off when another status line says it. */
    live?: boolean;
  }

  let {
    label,
    decreaseLabel,
    increaseLabel,
    value,
    min,
    max,
    onchange,
    testId,
    live = true,
  }: Props = $props();
  const uid = $props.id();
  const part = (name: string): string | undefined =>
    testId === undefined ? undefined : `${testId}-${name}`;

  // Buttons at a limit stay focusable, so focus does not drop to the page when one is reached.
  function step(by: number): void {
    const next = value + by;
    if (next >= min && next <= max) onchange(next);
  }
</script>

<div class="stepper" role="group" aria-label={label}>
  <button
    type="button"
    class="hit-area"
    aria-label={decreaseLabel}
    aria-disabled={value <= min}
    aria-controls="{uid}-value"
    data-testid={part('fewer')}
    onclick={() => step(-1)}><span aria-hidden="true">−</span></button
  >
  <output
    id="{uid}-value"
    class="value"
    aria-live={live ? 'polite' : 'off'}
    data-testid={part('count')}
    data-value={value}>{value}</output
  >
  <button
    type="button"
    class="hit-area"
    aria-label={increaseLabel}
    aria-disabled={value >= max}
    aria-controls="{uid}-value"
    data-testid={part('more')}
    onclick={() => step(1)}><span aria-hidden="true">+</span></button
  >
</div>

<style>
  .stepper {
    align-items: center;
    display: flex;
    gap: 10px;
  }

  button {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    color: var(--ink);
    font-size: 1.25rem;
    font-weight: 700;
    height: 40px;
    line-height: 1;
    min-height: 0;
    min-width: 0;
    padding: 0;
    width: 40px;
  }

  button[aria-disabled='true'] {
    opacity: 0.45;
  }

  .value {
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    line-height: 1;
    min-width: 28px;
    text-align: center;
  }
</style>
