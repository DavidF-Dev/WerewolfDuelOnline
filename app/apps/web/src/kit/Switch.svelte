<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLButtonAttributes, 'onchange'> {
    checked: boolean;
    /** The switch's accessible name, when no visible label names it through `labelledby`. */
    label?: string;
    labelledby?: string;
    /** The words shown for each state, so the state never depends on colour. */
    onText: string;
    offText: string;
    onchange: (checked: boolean) => void;
  }

  let { checked, label, labelledby, onText, offText, onchange, ...rest }: Props = $props();
</script>

<button
  {...rest}
  type="button"
  role="switch"
  class={['switch', rest.class]}
  aria-checked={checked}
  aria-label={labelledby === undefined ? label : undefined}
  aria-labelledby={labelledby}
  onclick={() => onchange(!checked)}
>
  <span class="state" aria-hidden="true">{checked ? onText : offText}</span>
  <span class={['track', { on: checked }]} aria-hidden="true"></span>
</button>

<style>
  .switch {
    align-items: center;
    background: none;
    border: 0;
    border-radius: var(--radius-small);
    display: inline-flex;
    gap: 8px;
    justify-content: flex-end;
    min-height: var(--target);
    min-width: var(--target);
    padding: 0;
  }

  .switch:hover {
    background: none;
  }

  .state {
    font-size: 0.75rem;
    font-weight: 700;
    min-width: 2em;
    text-align: end;
  }

  .track {
    background: var(--line);
    border-radius: 11px;
    flex: none;
    height: 22px;
    position: relative;
    transition:
      background-color var(--motion-fast) ease-out,
      box-shadow var(--motion-fast) ease-out;
    width: 38px;
  }

  @media (hover: hover) and (pointer: fine) {
    .switch:hover:not(:disabled, [aria-disabled='true']) .track {
      box-shadow: 0 0 0 3px var(--hover-halo);
    }
  }

  .track::after {
    background: #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 25%, transparent);
    content: '';
    height: 16px;
    left: 3px;
    position: absolute;
    top: 3px;
    transition: left var(--motion-fast) ease-out;
    width: 16px;
  }

  .track.on {
    background: var(--accent);
  }

  .track.on::after {
    left: 19px;
  }
</style>
