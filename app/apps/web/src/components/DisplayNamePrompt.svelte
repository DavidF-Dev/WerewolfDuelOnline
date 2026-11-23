<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import { MAX_NAME_LENGTH } from '@wwd/protocol';

  interface Props {
    localiser: Localiser;
    value: string;
  }

  let { localiser: l, value = $bindable() }: Props = $props();
  const uid = $props.id();
</script>

<p>
  <label for="{uid}-name">{l.t('name-label')}</label>
  <input
    id="{uid}-name"
    type="text"
    autocomplete="nickname"
    maxlength={MAX_NAME_LENGTH}
    aria-describedby="{uid}-hint"
    data-testid="display-name"
    bind:value
  />
</p>
<p id="{uid}-hint">{l.t('name-hint')}</p>
