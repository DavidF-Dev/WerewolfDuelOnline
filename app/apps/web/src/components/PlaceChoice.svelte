<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import Label from '../kit/Label.svelte';
  import Segmented from '../kit/Segmented.svelte';
  import { placeOptions, type Place } from '../place.js';

  interface Props {
    localiser: Localiser;
    /** Which screen asks, which decides the hint shown under the choice. */
    purpose: 'create' | 'join';
    value: Place;
  }

  let { localiser: l, purpose, value = $bindable() }: Props = $props();
  const uid = $props.id();
</script>

<div class="place">
  <Label id="{uid}-place">{l.t('play-label')}</Label>
  <Segmented
    labelledby="{uid}-place"
    describedby="{uid}-hint"
    stretch
    {value}
    options={placeOptions(l)}
    onchange={(chosen) => (value = chosen)}
  />
  <p id="{uid}-hint" class="hint" data-testid="place-hint">
    {l.t(`play-${purpose}-hint-${value}`)}
  </p>
</div>

<style>
  .hint {
    color: var(--muted);
    font-size: 0.71875rem;
    margin: 6px 0 0;
  }
</style>
