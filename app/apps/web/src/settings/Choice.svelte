<script lang="ts" generics="T extends string">
  import Segmented from '../kit/Segmented.svelte';

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

<div data-part="setting">
  <span id="{uid}-legend" data-part="setting-name">{legend}</span>
  <span data-part="setting-control">
    <Segmented labelledby="{uid}-legend" {value} {options} {onchange} />
  </span>
</div>
