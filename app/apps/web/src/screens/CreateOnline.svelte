<script lang="ts">
  import { onMount } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import { GRACE_CHOICES_MINUTES } from '@wwd/protocol';
  import { DEFAULT_SERVER, createRoom, joinHash, type CreateRoomProblem } from '../online.js';
  import { hrefFor } from '../router.js';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();
  const uid = $props.id();

  let grace = $state<(typeof GRACE_CHOICES_MINUTES)[number]>(10);
  let busy = $state(false);
  let problem = $state<CreateRoomProblem | null>(null);
  let mounted = true;
  onMount(() => () => {
    mounted = false;
  });

  const PROBLEM_IDS: Readonly<Record<CreateRoomProblem, string>> = {
    rate_limited: 'create-failed-rate-limited',
    unavailable: 'create-failed-unavailable',
    network: 'create-failed-network',
    other: 'create-failed-other',
  };

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    busy = true;
    problem = null;
    const result = await createRoom(DEFAULT_SERVER, grace);
    if (!mounted) return;
    busy = false;
    if (result.ok) location.hash = joinHash(result.code, DEFAULT_SERVER);
    else problem = result.problem;
  }
</script>

<main aria-labelledby="{uid}-heading" data-testid="create-online">
  <h1 id="{uid}-heading">{l.t('create-heading')}</h1>
  <form onsubmit={submit}>
    <fieldset aria-describedby="{uid}-grace-hint">
      <legend>{l.t('create-grace-legend')}</legend>
      <p id="{uid}-grace-hint">{l.t('create-grace-hint')}</p>
      {#each GRACE_CHOICES_MINUTES as minutes (minutes)}
        <label>
          <input
            type="radio"
            name="grace"
            value={minutes}
            data-testid="grace-{minutes}"
            bind:group={grace}
          />
          {l.t('create-grace-option', { minutes })}
        </label>
      {/each}
    </fieldset>
    <button type="submit" aria-disabled={busy} data-testid="create-submit"
      >{l.t('create-submit')}</button
    >
  </form>
  <p role="status">{busy ? l.t('create-creating') : ''}</p>
  {#if problem !== null}
    <p role="alert" data-testid="create-failed">{l.t(PROBLEM_IDS[problem])}</p>
  {/if}
  <p><a href={hrefFor('home')}>{l.t('back-home')}</a></p>
</main>
