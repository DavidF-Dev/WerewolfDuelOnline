<script lang="ts">
  import { onMount } from 'svelte';
  import type { Localiser } from '@wwd/client-core';
  import {
    defaultRulesConfig,
    type MinTargets,
    type RulesConfig,
    type Seat,
    type Tiebreak,
  } from '@wwd/engine';
  import { GRACE_CHOICES_MINUTES } from '@wwd/protocol';
  import Screen from '../components/Screen.svelte';
  import { getDeviceStore } from '../device-store.js';
  import { DEFAULT_SERVER, createRoom, joinHash, serverFor, createProblemId } from '../online.js';
  import { hrefFor } from '../router.js';

  interface Props {
    localiser: Localiser;
  }

  type BadgeChoice = 'random' | 'me' | 'opponent';

  // The creator is the first to join, so takes the first seat.
  const CREATOR_SEAT: Seat = 'p0';
  const OPPONENT_SEAT: Seat = 'p1';
  const BADGE_CHOICES: readonly BadgeChoice[] = ['random', 'me', 'opponent'];
  const TIEBREAKS: readonly Tiebreak[] = ['hourglasses_then_badge', 'badge_only'];
  const MIN_TARGETS: readonly MinTargets[] = [0, 1];
  function badgeChoiceOf(start: RulesConfig['badge_start']): BadgeChoice {
    if (start === 'random') return 'random';
    return start.seat === CREATOR_SEAT ? 'me' : 'opponent';
  }

  const badgeStartOf = (choice: BadgeChoice): RulesConfig['badge_start'] =>
    choice === 'random' ? 'random' : { seat: choice === 'me' ? CREATOR_SEAT : OPPONENT_SEAT };

  let { localiser: l }: Props = $props();
  const uid = $props.id();
  const store = getDeviceStore();
  const defaults = defaultRulesConfig();

  let badge = $state<BadgeChoice>(badgeChoiceOf(defaults.badge_start));
  let grace = $state<(typeof GRACE_CHOICES_MINUTES)[number]>(10);
  let tiebreak = $state<Tiebreak>(defaults.tiebreak);
  let minTargets = $state<MinTargets>(defaults.min_targets);
  let loaded = $state(store === undefined);
  let busy = $state(false);
  let problemId = $state<string | null>(null);
  let server = DEFAULT_SERVER;
  let mounted = true;

  onMount(() => {
    void (async () => {
      try {
        if (store !== undefined) {
          server = serverFor((await store.settings.get()).server);
        }
      } catch {
        // The default server is used.
      }
      if (mounted) loaded = true;
    })();
    return () => {
      mounted = false;
    };
  });

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busy || !loaded) return;
    busy = true;
    problemId = null;
    const config: RulesConfig = {
      tiebreak,
      min_targets: minTargets,
      badge_start: badgeStartOf(badge),
    };
    const result = await createRoom(server, grace, undefined, config);
    if (!mounted) return;
    busy = false;
    if (!result.ok) {
      problemId = createProblemId(result.problem, navigator.onLine);
      return;
    }
    location.hash = joinHash(result.code, server);
  }
</script>

<Screen title={l.t('create-heading')} testId="create-online" backLabel={l.t('back')}>
  <form onsubmit={submit} aria-busy={!loaded} data-testid="create-form">
    <fieldset>
      <legend>{l.t('create-badge-legend')}</legend>
      {#each BADGE_CHOICES as choice (choice)}
        <label>
          <input
            type="radio"
            name="{uid}-badge"
            value={choice}
            data-testid="badge-{choice}"
            bind:group={badge}
          />
          {l.t(`create-badge-${choice}`)}
        </label>
      {/each}
    </fieldset>
    <fieldset aria-describedby="{uid}-grace-hint">
      <legend>{l.t('create-grace-legend')}</legend>
      <p id="{uid}-grace-hint">{l.t('create-grace-hint')}</p>
      {#each GRACE_CHOICES_MINUTES as minutes (minutes)}
        <label>
          <input
            type="radio"
            name="{uid}-grace"
            value={minutes}
            data-testid="grace-{minutes}"
            bind:group={grace}
          />
          {l.t('create-grace-option', { minutes })}
        </label>
      {/each}
    </fieldset>
    <details>
      <summary>{l.t('create-advanced')}</summary>
      <fieldset>
        <legend>{l.t('create-tiebreak-legend')}</legend>
        {#each TIEBREAKS as option (option)}
          <label>
            <input type="radio" name="{uid}-tiebreak" value={option} bind:group={tiebreak} />
            {l.t(`create-tiebreak-${option}`)}
          </label>
        {/each}
      </fieldset>
      <fieldset aria-describedby="{uid}-targets-hint">
        <legend>{l.t('create-min-targets-legend')}</legend>
        <p id="{uid}-targets-hint">{l.t('create-min-targets-hint')}</p>
        {#each MIN_TARGETS as count (count)}
          <label>
            <input type="radio" name="{uid}-targets" value={count} bind:group={minTargets} />
            {l.t('create-min-targets-option', { count })}
          </label>
        {/each}
      </fieldset>
    </details>
    <button type="submit" aria-disabled={busy} data-testid="create-submit"
      >{l.t('create-submit')}</button
    >
  </form>
  <p role="status">{busy ? l.t('create-creating') : ''}</p>
  {#if problemId !== null}
    <p role="alert" data-testid="create-failed">{l.t(problemId)}</p>
  {/if}
  <p><a href={hrefFor('home')}>{l.t('back-home')}</a></p>
</Screen>
