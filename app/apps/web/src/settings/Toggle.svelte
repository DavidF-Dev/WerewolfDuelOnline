<script lang="ts">
  import Switch from '../kit/Switch.svelte';

  interface Props {
    label: string;
    checked: boolean;
    /** The words shown for each state, so the state never depends on colour. */
    onText: string;
    offText: string;
    onchange: (checked: boolean) => void;
  }

  let { label, checked, onText, offText, onchange }: Props = $props();
  const uid = $props.id();
</script>

<div data-part="setting">
  <label for="{uid}-switch" data-part="setting-name">{label}</label>
  <span data-part="setting-control">
    <Switch id="{uid}-switch" {checked} {onText} {offText} {onchange} />
  </span>
</div>
