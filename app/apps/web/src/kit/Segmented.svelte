<script lang="ts" generics="T extends string">
  let {
    label,
    labelledby,
    describedby,
    stretch = false,
    value,
    options,
    onchange,
  }: {
    /** The group's accessible name, when no visible label names it through `labelledby`. */
    label?: string;
    labelledby?: string;
    describedby?: string;
    /** Fills the width, sharing it equally between the options. */
    stretch?: boolean;
    value: T;
    /** The choices; `testId` marks an option's radio button for tests. */
    options: ReadonlyArray<{ value: T; label: string; testId?: string }>;
    onchange: (value: T) => void;
  } = $props();
  const uid = $props.id();
</script>

<div
  class={['segmented', { stretch }]}
  role="radiogroup"
  aria-label={labelledby === undefined ? label : undefined}
  aria-labelledby={labelledby}
  aria-describedby={describedby}
>
  {#each options as option (option.value)}
    <label class="option">
      <input
        type="radio"
        name="{uid}-segmented"
        value={option.value}
        checked={value === option.value}
        data-testid={option.testId}
        onchange={() => onchange(option.value)}
      />
      <span class="face">{option.label}</span>
    </label>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    flex-wrap: nowrap;
    font-size: 0.75rem;
    line-height: 1.4;
    white-space: nowrap;
  }

  .stretch {
    display: flex;
    width: 100%;
  }

  .stretch .option {
    flex: 1 1 0;
    min-width: 0;
  }

  .option {
    align-items: center;
    cursor: pointer;
    display: inline-flex;
    min-height: var(--target);
    min-width: var(--target);
    position: relative;
  }

  input {
    appearance: none;
    border: 0;
    height: 100%;
    inset: 0;
    margin: 0;
    min-height: 0;
    min-width: 0;
    opacity: 0;
    padding: 0;
    position: absolute;
    width: 100%;
  }

  .face {
    background: var(--surface);
    border-block: 1px solid var(--line);
    padding: 4px clamp(4px, 1.5vw, 8px);
    text-align: center;
    width: 100%;
  }

  .option:first-child .face {
    border-end-start-radius: 8px;
    border-inline-start: 1px solid var(--line);
    border-start-start-radius: 8px;
  }

  .option:last-child .face {
    border-end-end-radius: 8px;
    border-inline-end: 1px solid var(--line);
    border-start-end-radius: 8px;
  }

  input:checked + .face {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
  }

  input:focus-visible + .face {
    outline: var(--focus-width) solid var(--focus);
    outline-offset: 2px;
    position: relative;
    z-index: 1;
  }
</style>
