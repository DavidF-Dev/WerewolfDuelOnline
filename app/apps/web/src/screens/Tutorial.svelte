<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Command } from '@wwd/engine';
  import type { GameClientState, Localiser } from '@wwd/client-core';
  import Button from '../components/Button.svelte';
  import Screen from '../components/Screen.svelte';
  import { getDeviceStore, patchSettings } from '../device-store.js';
  import { loadEngine } from '../engine.js';
  import { hrefFor } from '../router.js';
  import { showScreenTop } from '../shell.js';
  import { motionReduced } from '../settings/apply.js';
  import { display } from '../settings/display.svelte.js';
  import { coachFor } from '../tutorial/coach.js';
  import { startTutorial, type TutorialRun } from '../tutorial/runner.js';
  import { TUTORIAL_STEPS } from '../tutorial/script.js';
  import TutorialDone from '../tutorial/TutorialDone.svelte';
  import Table from './Table.svelte';

  interface Props {
    localiser: Localiser;
  }

  let { localiser: l }: Props = $props();

  /** How long the opponent waits before each scripted move, unless motion is reduced. */
  const OPPONENT_DELAY_MS = 600;
  const LAST_STEP = TUTORIAL_STEPS.length - 1;

  let run = $state.raw<TutorialRun | null>(null);
  let snapshot = $state.raw<GameClientState | null>(null);
  let step = $state(0);
  let failed = $state(false);
  let finished = $state(false);
  let notice = $state<string | null>(null);
  // Counts the starts, so that playing again opens a fresh game.
  let attempt = $state(0);

  const coach = $derived(coachFor(l, TUTORIAL_STEPS[step] ?? TUTORIAL_STEPS[0]!, next));
  // The opponent's name follows the language, which may change during the tutorial.
  const shown = $derived(
    snapshot === null
      ? null
      : { ...snapshot, opponent: { ...snapshot.opponent, name: l.t('tutorial-opponent-name') } },
  );

  // Which screen shows; each new one gets focus as a new route's screen would.
  const screen = $derived(
    finished
      ? 'done'
      : !failed && snapshot !== null && snapshot.view !== null
        ? `table|${attempt}`
        : `waiting|${attempt}|${failed}`,
  );
  let screenShown: string | undefined;
  $effect(() => {
    const now = screen;
    // The first screen is the route's own, which the app has already focused.
    if (screenShown !== undefined && screenShown !== now) void tick().then(showScreenTop);
    screenShown = now;
  });

  function next(): void {
    if (step < LAST_STEP) {
      run?.next();
      return;
    }
    run?.dispose();
    finished = true;
    void patchSettings({ tutorialFinished: true });
  }

  function again(): void {
    snapshot = null;
    step = 0;
    failed = false;
    finished = false;
    attempt += 1;
  }

  /** Ends the tutorial and goes to How to play, in place of the tutorial in the history. */
  function leave(): void {
    run?.dispose();
    location.replace(hrefFor('how-to-play'));
  }

  async function displayName(): Promise<string> {
    try {
      return (await getDeviceStore()?.identity.get())?.displayName ?? '';
    } catch {
      return '';
    }
  }

  $effect(() => {
    void attempt;
    const abort = new AbortController();
    const offs: Array<() => void> = [];
    let started: TutorialRun | null = null;
    let live = true;
    void (async () => {
      await loadEngine();
      const opened = await startTutorial({
        playerName: await displayName(),
        opponentName: l.t('tutorial-opponent-name'),
        delayMs: motionReduced(display.reducedMotion) ? 0 : OPPONENT_DELAY_MS,
        signal: abort.signal,
      });
      if (!live) {
        opened.dispose();
        return;
      }
      started = opened;
      run = opened;
      offs.push(
        opened.player.state.subscribe((value) => {
          snapshot = value;
          notice = null;
        }),
        opened.step.subscribe((value) => (step = value)),
      );
    })().catch((thrown: unknown) => {
      if (!live) return;
      console.error(thrown);
      failed = true;
    });
    return () => {
      live = false;
      abort.abort();
      for (const off of offs) off();
      started?.dispose();
      run = null;
    };
  });

  // Nothing of the tutorial outlives the page; a page restored from the cache opens How to play.
  onMount(() => {
    const leaving = (): void => run?.dispose();
    const restored = (event: PageTransitionEvent): void => {
      if (event.persisted) location.replace(hrefFor('how-to-play'));
    };
    window.addEventListener('pagehide', leaving);
    window.addEventListener('pageshow', restored);
    return () => {
      window.removeEventListener('pagehide', leaving);
      window.removeEventListener('pageshow', restored);
    };
  });

  function command(cmd: Command): void {
    try {
      run?.player.command(cmd);
    } catch {
      notice = 'problem-command-not-sent';
    }
  }
</script>

{#snippet leaveItem()}
  <Button data-testid="tutorial-leave" onclick={leave}>{l.t('tutorial-leave')}</Button>
{/snippet}

{#if finished}
  <TutorialDone localiser={l} onAgain={again} onLeave={leave} />
{:else if !failed && shown !== null && shown.view !== null}
  <Table localiser={l} state={shown} onCommand={command} {notice} {coach} menu={leaveItem} />
{:else}
  <Screen title={l.t('tutorial-heading')} testId="tutorial" back={l.t('back')} onback={leave}>
    {#if failed}
      <p role="alert" data-testid="tutorial-failed">{l.t('tutorial-failed')}</p>
    {:else}
      <p role="status">{l.t('tutorial-starting')}</p>
    {/if}
  </Screen>
{/if}
