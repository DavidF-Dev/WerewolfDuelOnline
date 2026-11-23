<script lang="ts" generics="T extends string">
  let {
    legend,
    value,
    options,
    onchange,
  }: {
    legend: string;
    value: T;
    options: ReadonlyArray<{ value: T; label: string }>;
    onchange: (value: T) => void;
  } = $props();
  const uid = $props.id();
</script>

<fieldset class="row">
  <legend>{legend}</legend>
  <div class="options">
    {#each options as option (option.value)}
      <label class="option">
        <input
          type="radio"
          name="{uid}-choice"
          value={option.value}
          checked={value === option.value}
          onchange={() => onchange(option.value)}
        />
        {option.label}
      </label>
    {/each}
  </div>
</fieldset>

<style>
  fieldset {
    border: 0;
    margin: 0;
    min-width: 0;
    padding: 0;
  }

  legend {
    float: left;
    margin-inline-end: 1rem;
    padding: 0;
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
  }

  .option {
    align-items: center;
    display: inline-flex;
    gap: 0.5rem;
    min-height: var(--target);
  }

  input {
    height: 1.25rem;
    margin: 0;
    min-height: 0;
    min-width: 0;
    width: 1.25rem;
  }
</style>
