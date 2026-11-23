<script lang="ts">
  interface Props {
    label: string;
    checked: boolean;
    /** The words shown for each state, so the state never depends on colour. */
    onText: string;
    offText: string;
    onchange: (checked: boolean) => void;
  }

  let { label, checked, onText, offText, onchange }: Props = $props();
</script>

<label class="row toggle">
  <span>{label}</span>
  <span class="control">
    <input
      type="checkbox"
      role="switch"
      {checked}
      onchange={(event) => onchange(event.currentTarget.checked)}
    />
    <span class="state" aria-hidden="true">{checked ? onText : offText}</span>
  </span>
</label>

<style>
  .toggle {
    min-height: var(--target);
  }

  .control {
    align-items: center;
    display: inline-flex;
    gap: 0.5rem;
  }

  input {
    height: 1.5rem;
    margin: 0;
    min-height: 0;
    min-width: 0;
    width: 1.5rem;
  }

  .state {
    font-weight: 700;
    min-width: 2.5rem;
  }
</style>
