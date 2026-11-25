<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import { MAX_NAME_LENGTH } from '@wwd/protocol';
  import Dialog from '../kit/Dialog.svelte';
  import Label from '../kit/Label.svelte';
  import Button from './Button.svelte';

  interface Props {
    localiser: Localiser;
    value: string;
    /** Called with `true` when the player skips the question, including with Escape. */
    onanswer: (skip: boolean) => void;
  }

  let { localiser: l, value = $bindable(), onanswer }: Props = $props();
  const uid = $props.id();
</script>

<Dialog title={l.t('name-title')} oncancel={() => onanswer(true)}>
  <form
    id="{uid}-form"
    class="form"
    data-testid="name-prompt"
    onsubmit={(event) => {
      event.preventDefault();
      onanswer(false);
    }}
  >
    <Label as="label" for="{uid}-name">{l.t('name-label')}</Label>
    <input
      id="{uid}-name"
      type="text"
      autocomplete="nickname"
      maxlength={MAX_NAME_LENGTH}
      aria-describedby="{uid}-hint"
      data-testid="display-name"
      data-autofocus
      bind:value
    />
    <p id="{uid}-hint" class="hint">{l.t('name-hint')}</p>
  </form>
  {#snippet actions()}
    <Button type="submit" form="{uid}-form" variant="primary" data-testid="name-continue"
      >{l.t('name-continue')}</Button
    >
    <Button data-testid="name-skip" onclick={() => onanswer(true)}>{l.t('name-skip')}</Button>
  {/snippet}
</Dialog>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  input {
    width: 100%;
  }

  .hint {
    color: var(--muted);
  }
</style>
