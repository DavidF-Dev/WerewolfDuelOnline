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
  import { GRACE_CHOICES_MINUTES, type GraceMinutes } from '@wwd/protocol';
  import Button from '../components/Button.svelte';
  import PlaceChoice from '../components/PlaceChoice.svelte';
  import Screen from '../components/Screen.svelte';
  import Panel from '../kit/Panel.svelte';
  import Segmented from '../kit/Segmented.svelte';
  import Spinner from '../kit/Spinner.svelte';
  import { getDeviceStore } from '../device-store.js';
  import { DEFAULT_SERVER, createRoom, joinHash, serverFor, createProblemId } from '../online.js';
  import { navigate } from '../router.js';
  import type { Place } from '../place.js';

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

  const badgeOptions = BADGE_CHOICES.map((choice) => ({
    value: choice,
    label: l.t(`create-badge-${choice}`),
    testId: `badge-${choice}`,
  }));
  const graceOptions = GRACE_CHOICES_MINUTES.map((minutes) => ({
    value: String(minutes) as `${GraceMinutes}`,
    label: l.t('create-grace-option', { minutes }),
    testId: `grace-${minutes}`,
  }));
  const tiebreakOptions = TIEBREAKS.map((option) => ({
    value: option,
    label: l.t(`create-tiebreak-${option}`),
  }));
  const minTargetOptions = MIN_TARGETS.map((count) => ({
    value: String(count) as `${MinTargets}`,
    label: l.t('create-min-targets-option', { count }),
  }));

  let place = $state<Place>('online');
  let badge = $state<BadgeChoice>(badgeChoiceOf(defaults.badge_start));
  let grace = $state<`${GraceMinutes}`>('10');
  let tiebreak = $state<Tiebreak>(defaults.tiebreak);
  let minTargets = $state<`${MinTargets}`>(`${defaults.min_targets}`);
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
    if (place === 'device') {
      navigate('local-host');
      return;
    }
    if (busy || !loaded) return;
    busy = true;
    problemId = null;
    const config: RulesConfig = {
      tiebreak,
      min_targets: Number(minTargets) as MinTargets,
      badge_start: badgeStartOf(badge),
    };
    const result = await createRoom(server, Number(grace) as GraceMinutes, undefined, config);
    if (!mounted) return;
    busy = false;
    if (!result.ok) {
      problemId = createProblemId(result.problem, navigator.onLine);
      return;
    }
    location.hash = joinHash(result.code, server);
  }
</script>

<Screen title={l.t('create-heading')} testId="create-online" back={l.t('back')}>
  <form class="form" onsubmit={submit} aria-busy={!loaded} data-testid="create-form">
    <Panel>
      <PlaceChoice localiser={l} purpose="create" bind:value={place} />
    </Panel>
    {#if place === 'online'}
      <Panel class="rules">
        <div class="row">
          <span id="{uid}-badge">{l.t('create-badge-legend')}</span>
          <Segmented
            labelledby="{uid}-badge"
            stretch
            value={badge}
            options={badgeOptions}
            onchange={(value) => (badge = value)}
          />
        </div>
        <div class="row">
          <span id="{uid}-grace">{l.t('create-grace-legend')}</span>
          <Segmented
            labelledby="{uid}-grace"
            stretch
            describedby="{uid}-grace-hint"
            value={grace}
            options={graceOptions}
            onchange={(value) => (grace = value)}
          />
        </div>
        <p id="{uid}-grace-hint" class="hint">{l.t('create-grace-hint')}</p>
        <details class="advanced">
          <summary>{l.t('create-advanced')}</summary>
          <div class="row">
            <span id="{uid}-tiebreak">{l.t('create-tiebreak-legend')}</span>
            <Segmented
              labelledby="{uid}-tiebreak"
              stretch
              value={tiebreak}
              options={tiebreakOptions}
              onchange={(value) => (tiebreak = value)}
            />
          </div>
          <div class="row">
            <span id="{uid}-targets">{l.t('create-min-targets-legend')}</span>
            <Segmented
              labelledby="{uid}-targets"
              stretch
              describedby="{uid}-targets-hint"
              value={minTargets}
              options={minTargetOptions}
              onchange={(value) => (minTargets = value)}
            />
          </div>
          <p id="{uid}-targets-hint" class="hint">{l.t('create-min-targets-hint')}</p>
        </details>
      </Panel>
    {/if}
    <div class="spacer">
      <p class="message" role="status">
        {#if busy}{l.t('create-creating')}<Spinner />{/if}
      </p>
      {#if problemId !== null}
        <p class="message" role="alert" data-testid="create-failed">{l.t(problemId)}</p>
      {/if}
    </div>
    <Button type="submit" variant="primary" aria-disabled={busy} data-testid="create-submit"
      >{l.t('create-submit')}</Button
    >
  </form>
</Screen>

<style>
  .form {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 10px;
  }

  .form :global(.rules) {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .row {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    justify-content: space-between;
  }

  .row :global(.segmented) {
    flex: 1 1 auto;
    min-width: max-content;
    width: auto;
  }

  .hint {
    color: var(--muted);
    font-size: 0.71875rem;
    margin: -4px 0 0;
  }

  .advanced {
    border-top: 1px solid var(--line);
  }

  .advanced[open] {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  summary {
    cursor: pointer;
    font-weight: 600;
    padding-block: 12px 4px;
    transition: color var(--motion-fast) ease-out;
  }

  @media (hover: hover) and (pointer: fine) {
    summary:hover {
      color: var(--accent);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  }

  .spacer {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 6px;
    justify-content: flex-end;
  }

  .message {
    margin: 0;
  }
</style>
