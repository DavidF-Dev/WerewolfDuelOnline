<script lang="ts">
  import type { Localiser } from '@wwd/client-core';
  import Label from '../kit/Label.svelte';
  import { EXAMPLE_CODE } from '../code.js';

  interface Props {
    localiser: Localiser;
    value: string;
    /** Marks the code as not valid and shows `error`. */
    invalid: boolean;
    error: string;
    testId: string;
  }

  let { localiser: l, value = $bindable(), invalid, error, testId }: Props = $props();
  const uid = $props.id();
</script>

<div class="field">
  <Label as="label" for="{uid}-code">{l.t('join-code-label')}</Label>
  <input
    id="{uid}-code"
    class="code"
    name="code"
    autocomplete="off"
    autocapitalize="characters"
    spellcheck="false"
    aria-invalid={invalid}
    aria-describedby={invalid ? `${uid}-hint ${uid}-error` : `${uid}-hint`}
    data-testid={testId}
    bind:value
  />
  <p id="{uid}-hint" class="hint">{l.t('join-code-hint', { example: EXAMPLE_CODE })}</p>
  {#if invalid}
    <p id="{uid}-error" class="error" role="alert">{error}</p>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .code {
    font-family: var(--font-mono);
    font-size: 1.875rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    line-height: 1.2;
    text-align: center;
    text-transform: uppercase;
    width: 100%;
  }

  .hint,
  .error {
    font-size: 0.75rem;
    margin: 0;
  }

  .hint {
    color: var(--muted);
  }

  .error {
    color: var(--danger);
    font-weight: 600;
  }
</style>
