import type { Component } from 'svelte';
import type { GameClientState } from '@wwd/client-core';
import { exportBackup } from '../backup/export.js';
import { freezeMarkerChanges } from '../components/MarkerCount.svelte';
import { getDeviceStore } from '../device-store.js';
import About from '../screens/About.svelte';
import CreateOnline from '../screens/CreateOnline.svelte';
import History from '../screens/History.svelte';
import Home from '../screens/Home.svelte';
import Host from '../screens/Host.svelte';
import HowToPlay from '../screens/HowToPlay.svelte';
import Join from '../screens/Join.svelte';
import JoinOnline from '../screens/JoinOnline.svelte';
import Rejoin from '../screens/Rejoin.svelte';
import Replay from '../screens/Replay.svelte';
import Rules from '../screens/Rules.svelte';
import Settings from '../screens/Settings.svelte';
import Stats from '../screens/Stats.svelte';
import Tutorial from '../screens/Tutorial.svelte';
import { targetId } from '../cards.js';
import {
  badgePlanState,
  FIRST_PAST_GAME,
  HUNTER_PAST_GAME,
  HUNTER_STEP,
  OFFLINE,
  ONLINE,
  eliminationBeforeState,
  eliminationState,
  OTHER_SERVER,
  ROOM,
  gameOverState,
  hourglassState,
  hunterGame,
  hunterState,
  LONG_NAME,
  opponentPlacedState,
  opponentZeroState,
  nameThisDevice,
  offerInstall,
  offerIosInstall,
  offerUpdate,
  opponentAwayState,
  opponentGoneState,
  pastGames,
  pausedState,
  planOf,
  planState,
  potionState,
  rejoinRequestState,
  returningPlayer,
  roundOverState,
  sealedPlanState,
  villagerPlanState,
  waitingState,
  wolfKingPotionState,
  wolfKingShowdownState,
} from './fixtures.js';
import CardsGallery from './CardsGallery.svelte';
import FitStage from './FitStage.svelte';
import InviteWaiting from './InviteWaiting.svelte';
import KitGallery from './KitGallery.svelte';
import OnlineTable from './OnlineTable.svelte';
import Staged from './Staged.svelte';
import {
  byTestId,
  click,
  clickButton,
  open,
  present,
  stepShowdown,
  until,
  type Act,
  type Stage,
} from './stage.js';

export interface GalleryEntry {
  id: string;
  /** The number of the mockup this entry is compared with, or a named section of another mockup file. */
  mockup?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 'cards-H';
  /** Whether this is a game screen, which must fit the screen without scrolling. */
  game: boolean;
  title: string;
  render: Component<any>;
  props: Record<string, unknown>;
}

interface Staging {
  screen: Component<any>;
  props?: () => Record<string, unknown>;
  stage?: Stage;
  act?: Act;
}

const staged = (staging: Staging): Pick<GalleryEntry, 'render' | 'props'> => ({
  render: Staged,
  props: { ...staging },
});

/** The online table showing `state`, brought to its moment by `act`. */
const table = (
  state: () => GameClientState,
  act?: Act,
  connection = ONLINE,
): Pick<GalleryEntry, 'render' | 'props'> =>
  staged({
    screen: OnlineTable,
    props: () => ({ state: state(), connection }),
    ...(act && { act }),
  });

/** Chooses the Knight and the targets of its first one-target plan in `state`. */
const knightIn =
  (state: () => GameClientState): Act =>
  async () => {
    await click('plan-character-knight');
    for (const card of planOf(state().legal, 'knight', 1).submit_plan.targets) {
      await click(`target-${targetId(card)}`);
    }
  };

const planKnight = knightIn(planState);

/** Opens a sheet with its bar button and waits until it has finished rising. */
async function openSheet(toggle: string, sheet: string): Promise<void> {
  await click(toggle);
  const shown = await byTestId(sheet);
  await Promise.all(shown.getAnimations?.().map((animation) => animation.finished) ?? []);
}

const openMenu: Act = () => openSheet('game-menu-toggle', 'game-menu');

/** Waits until a marker count shows a change of `kind`. */
async function markerChange(kind: 'gain' | 'loss'): Promise<void> {
  await until(() => document.querySelector(`[data-change="${kind}"]`), `a marker ${kind}`);
}

/** Opens the More menu of the first Continue row. */
const openHomeMore: Act = async () => {
  await click('home-more');
  await byTestId('home-more-menu');
};

/** Waits until the tutorial's coach shows step `n`, from 1. */
const coachAt = (n: number): Promise<Element> =>
  until(() => document.querySelector(`[data-coach-step="${n}"]`), `tutorial step ${n}`);

/** Plays the tutorial up to step `n`, from 1, as the player would. */
async function tutorialTo(n: number): Promise<void> {
  await coachAt(1);
  await byTestId('coach-next');
  if (n === 1) return;
  await click('coach-next');
  await coachAt(2);
  await byTestId('plan-character-knight');
  if (n === 2) return;
  await click('plan-character-knight');
  await click('target-wolfen');
  await click('seal-plan');
  await coachAt(3);
  await byTestId('place-hourglasses');
  if (n === 3) return;
  await click('place-hourglasses');
  await coachAt(4);
  await byTestId('showdown-next');
  if (n === 4) return;
  await stepShowdown();
  await click('coach-next');
  await coachAt(5);
  await byTestId('round-summary');
  if (n === 5) return;
  await click('coach-next');
  await byTestId('tutorial-done');
}

/** The tutorial, played up to step `n`, or to its finished page after the last. */
const tutorial = (n: number, stage?: Stage): Pick<GalleryEntry, 'render' | 'props'> =>
  staged({ screen: Tutorial, ...(stage && { stage }), act: () => tutorialTo(n) });

const settingsNamed: Stage = async () => {
  await nameThisDevice();
  return offerInstall();
};

export const GALLERY: GalleryEntry[] = [
  {
    id: 'home',
    mockup: 1,
    game: false,
    title: 'Home with Continue and the install card',
    ...staged({
      screen: Home,
      stage: async () => {
        await returningPlayer();
        return offerInstall();
      },
    }),
  },
  {
    id: 'home-more',
    game: false,
    title: 'Home with the More menu of a game open',
    ...staged({ screen: Home, stage: returningPlayer, act: openHomeMore }),
  },
  {
    id: 'home-remove',
    game: false,
    title: 'Home asking before removing a game',
    ...staged({
      screen: Home,
      stage: returningPlayer,
      act: async (l) => {
        await openHomeMore(l);
        await click('home-remove');
        await byTestId('confirm-dialog');
      },
    }),
  },
  {
    id: 'home-newcomer',
    game: false,
    title: 'Home on first run, with the panel for newcomers',
    render: Home,
    props: {},
  },
  { id: 'new-game', game: false, title: 'New game options', render: CreateOnline, props: {} },
  {
    id: 'invite-waiting',
    mockup: 2,
    game: false,
    title: 'Invite while waiting for the opponent',
    ...staged({
      screen: InviteWaiting,
      props: () => ({ state: waitingState(), connection: ONLINE }),
    }),
  },
  { id: 'join', game: false, title: 'Join by code', render: JoinOnline, props: {} },
  {
    id: 'display-name',
    game: false,
    title: 'Display name prompt',
    render: JoinOnline,
    props: { code: ROOM },
  },
  {
    id: 'server-confirm',
    game: false,
    title: 'Server confirmation',
    render: JoinOnline,
    props: { code: ROOM, server: OTHER_SERVER },
  },
  {
    id: 'rejoin-pin',
    game: false,
    title: 'Rejoin with a PIN',
    render: Rejoin,
    props: { code: ROOM, seat: 'p0' },
  },
  { id: 'local-host', game: false, title: 'Local host', render: Host, props: {} },
  { id: 'local-join', game: false, title: 'Local join', render: Join, props: {} },
  {
    id: 'table-plan',
    mockup: 3,
    game: true,
    title: 'Table in the plan phase',
    ...table(planState, planKnight),
  },
  {
    id: 'table-plan-none-chosen',
    game: true,
    title: 'Table in the plan phase before a character is chosen',
    ...table(planState),
  },
  {
    id: 'table-plan-badge-hand',
    game: true,
    title: 'Table in the plan phase holding the Badge and four cards',
    ...table(badgePlanState, knightIn(badgePlanState)),
  },
  {
    id: 'table-plan-villager',
    game: true,
    title: 'Table in the plan phase with the Villager, the Fool chosen for you',
    ...table(villagerPlanState, () => click('plan-character-villager')),
  },
  {
    id: 'table-plan-long-name',
    game: true,
    title: 'Table in the plan phase facing a long, disconnected name',
    ...table(() => planState({ opponent: { connected: false, name: LONG_NAME } }), planKnight),
  },
  {
    id: 'table-plan-seal',
    game: true,
    title: 'Table in the plan phase with the seal confirmation',
    ...table(planState, async (l) => {
      await planKnight(l);
      await click('seal-plan');
      await byTestId('confirm-dialog');
    }),
  },
  {
    id: 'table-plan-sealed',
    game: true,
    title: 'Table in the plan phase, waiting for the opponent',
    ...table(sealedPlanState),
  },
  {
    id: 'table-reveal-hourglasses',
    mockup: 4,
    game: true,
    title: 'Table revealing, placing Hourglasses while the opponent still chooses',
    ...table(hourglassState),
  },
  {
    id: 'table-reveal-opponent-zero',
    game: true,
    title: 'Table revealing, placing Hourglasses after the opponent placed none',
    ...table(opponentZeroState),
  },
  {
    id: 'table-reveal-opponent-placed',
    game: true,
    title: 'Table revealing, placing Hourglasses after the opponent placed some',
    ...table(opponentPlacedState),
  },
  {
    id: 'table-reveal-potion',
    game: true,
    title: 'Table revealing, choosing the Potion target',
    ...table(potionState),
  },
  {
    id: 'table-reveal-potion-wolf-king-five',
    game: true,
    title: 'Table revealing, naming the Potion target after playing the Wolf King at five targets',
    ...table(wolfKingPotionState),
  },
  {
    id: 'table-showdown',
    mockup: 5,
    game: true,
    title: 'Table in the showdown, the sides in acting order',
    ...table(roundOverState, () => click('showdown-next')),
  },
  {
    id: 'table-showdown-wolf-king-five',
    game: true,
    title: 'Table in the showdown, with the Wolf King at five targets',
    ...table(wolfKingShowdownState, () => click('showdown-next')),
  },
  {
    id: 'table-hunter',
    game: true,
    title: 'Table with the Hunter prompt',
    ...table(hunterState, async () => {
      await stepShowdown();
      await byTestId('hunter-prompt');
    }),
  },
  {
    id: 'table-round-summary',
    game: true,
    title: 'Table with the round summary and the discard',
    ...table(roundOverState, async () => {
      await stepShowdown();
      await byTestId('round-summary');
    }),
  },
  {
    id: 'table-showdown-elimination',
    game: true,
    title: 'Table at round end, with a character eliminated before it acted',
    ...table(eliminationState, stepShowdown),
  },
  {
    id: 'table-marker-gain',
    game: true,
    title: "Table in the showdown, the opponent's Hourglass count partway through its rise",
    ...staged({
      screen: OnlineTable,
      props: () => ({ state: roundOverState(), connection: ONLINE }),
      stage: freezeMarkerChanges,
      act: async () => {
        await click('showdown-next');
        await markerChange('gain');
      },
    }),
  },
  {
    id: 'table-marker-loss',
    game: true,
    title: 'Table as the showdown arrives, a Health count partway through its fall',
    ...staged({
      screen: OnlineTable,
      props: () => ({
        from: eliminationBeforeState(),
        state: eliminationState(),
        connection: ONLINE,
      }),
      stage: freezeMarkerChanges,
      act: () => markerChange('loss'),
    }),
  },
  { id: 'table-paused', game: true, title: 'Table while paused', ...table(pausedState) },
  {
    id: 'table-rejoin-request',
    game: true,
    title: 'Table with a rejoin request',
    ...table(rejoinRequestState, async () => {
      await byTestId('confirm-dialog');
    }),
  },
  {
    id: 'table-menu',
    game: true,
    title: 'Table with the game menu sheet',
    ...table(planState, openMenu),
  },
  {
    id: 'table-log',
    game: true,
    title: 'Table with the log and rules sheet',
    ...table(planState, () => openSheet('log-toggle', 'log-drawer')),
  },
  {
    id: 'table-rules-sheet',
    game: true,
    title: 'Table with the full rules over the log',
    ...table(planState, async () => {
      await openSheet('log-toggle', 'log-drawer');
      await openSheet('full-rules', 'rules-sheet');
    }),
  },
  {
    id: 'table-continue-elsewhere',
    game: true,
    title: 'Table with continue on another device',
    ...table(planState, async (l) => {
      await openMenu(l);
      await open('continue-elsewhere');
    }),
  },
  {
    id: 'table-resign',
    game: true,
    title: 'Table with the resign confirmation',
    ...table(planState, async (l) => {
      await openMenu(l);
      await click('resign');
      await byTestId('confirm-dialog');
    }),
  },
  {
    id: 'game-over-showdown',
    game: true,
    title: 'Table at game over, stepping through the final showdown seen live',
    ...staged({
      screen: OnlineTable,
      props: () => ({
        from: { ...gameOverState(), status: 'playing', view: planState().view },
        state: gameOverState(),
        connection: ONLINE,
      }),
      act: async () => {
        await byTestId('showdown-next');
      },
    }),
  },
  {
    id: 'game-over',
    mockup: 6,
    game: true,
    title: 'Game over with the result and past games',
    ...staged({
      screen: OnlineTable,
      props: () => ({ state: gameOverState(), connection: ONLINE }),
      stage: pastGames,
      act: async () => {
        await byTestId('game-over-history');
      },
    }),
  },
  {
    id: 'history',
    mockup: 6,
    game: false,
    title: 'History of three games',
    ...staged({ screen: History, stage: pastGames }),
  },
  {
    id: 'stats',
    game: false,
    title: 'Stats of three games',
    ...staged({ screen: Stats, stage: pastGames }),
  },
  {
    id: 'replay',
    game: true,
    title: 'Replay of a past game',
    ...staged({ screen: Replay, props: () => ({ id: FIRST_PAST_GAME }), stage: pastGames }),
  },
  {
    id: 'replay-long-log',
    game: true,
    title: 'Replay in the full view at its first step, with more log than fits',
    ...staged({
      screen: Replay,
      props: () => ({ id: FIRST_PAST_GAME }),
      stage: pastGames,
      act: async () => {
        await click('replay-view-full');
        await byTestId('replay-hand-p1');
      },
    }),
  },
  {
    id: 'replay-hunter',
    game: true,
    title: 'Replay at a Hunter attack that eliminates a character',
    ...staged({
      screen: Replay,
      props: () => ({ id: HUNTER_PAST_GAME }),
      stage: hunterGame,
      act: async () => {
        // The step is the first number in the position, in every language.
        const at = new RegExp(`^\\D*${HUNTER_STEP}\\D`, 'u');
        for (let step = 1; step < HUNTER_STEP; step++) await click('replay-next-step');
        await until(
          () =>
            at.test(document.querySelector('[data-testid="replay-position"]')?.textContent ?? '') ||
            null,
          `step ${HUNTER_STEP}`,
        );
        await byTestId('showdown-out');
      },
    }),
  },
  {
    id: 'replay-showdown',
    game: true,
    title: 'Replay at a showdown',
    ...staged({
      screen: Replay,
      props: () => ({ id: FIRST_PAST_GAME }),
      stage: pastGames,
      // The first showdown step that shows the round summary, with the card set aside.
      act: async () => {
        for (let step = 0; step < 40 && !present('round-set-aside-card'); step++) {
          await click('replay-next-step');
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        await byTestId('showdown');
        await byTestId('round-set-aside-card');
      },
    }),
  },
  {
    id: 'replay-menu',
    game: true,
    title: 'Replay with its menu sheet',
    ...staged({
      screen: Replay,
      props: () => ({ id: FIRST_PAST_GAME }),
      stage: pastGames,
      act: () => openSheet('replay-menu-toggle', 'replay-menu'),
    }),
  },
  {
    id: 'settings-top',
    mockup: 7,
    game: false,
    title: 'Settings at the top',
    ...staged({ screen: Settings, stage: settingsNamed }),
  },
  {
    id: 'settings-install-ios',
    game: false,
    title: 'Settings on an iPhone, with the steps to install',
    ...staged({
      screen: Settings,
      stage: async () => {
        await nameThisDevice();
        return offerIosInstall();
      },
    }),
  },
  {
    id: 'settings-scrolled',
    mockup: 8,
    game: false,
    title: 'Settings scrolled to the network and data groups',
    ...staged({
      screen: Settings,
      stage: settingsNamed,
      act: async (l) => {
        const heading = await until(
          () =>
            Array.from(document.querySelectorAll('h2')).find(
              (h) => h.textContent === l.t('settings-network'),
            ),
          'the network settings',
        );
        heading.scrollIntoView?.({ block: 'start' });
      },
    }),
  },
  {
    id: 'delete-all',
    mockup: 9,
    game: false,
    title: 'Settings asking to delete all data',
    ...staged({
      screen: Settings,
      stage: settingsNamed,
      act: async (l) => clickButton(l.t('settings-data-delete-all')),
    }),
  },
  {
    id: 'clear-history',
    game: false,
    title: 'Settings asking to clear the history',
    ...staged({
      screen: Settings,
      stage: pastGames,
      act: async (l) => clickButton(l.t('settings-data-clear-history')),
    }),
  },
  {
    id: 'backup-export',
    game: false,
    title: 'Settings exporting a backup',
    ...staged({
      screen: Settings,
      stage: pastGames,
      act: async (l) => {
        await clickButton(l.t('settings-data-export'));
        await byTestId('confirm-dialog');
      },
    }),
  },
  {
    id: 'backup-import',
    game: false,
    title: 'Settings previewing a backup to import',
    ...staged({
      screen: Settings,
      stage: pastGames,
      act: async () => {
        const store = getDeviceStore();
        if (store === undefined) throw new Error('the gallery has no device store');
        const input = await byTestId('backup-file');
        // A chosen file cannot be set from a script, so the backup stands in as the input's file.
        Object.defineProperty(input, 'files', { value: [await exportBackup(store)] });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await byTestId('confirm-dialog');
      },
    }),
  },
  { id: 'about', game: false, title: 'About and credits', render: About, props: {} },
  {
    id: 'how-to-play',
    game: false,
    title: 'How to play with the tutorial and the rules sections',
    render: HowToPlay,
    props: {},
  },
  {
    id: 'tutorial-goal',
    game: true,
    title: 'Tutorial, step 1: the goal, the markers ringed',
    ...tutorial(1),
  },
  {
    id: 'tutorial-plan',
    game: true,
    title: 'Tutorial, step 2: a plan, only the Knight and the Wolfen offered',
    ...tutorial(2),
  },
  {
    id: 'tutorial-reveal',
    game: true,
    title: "Tutorial, step 3: the reveal, the opponent's Hourglass pill ringed",
    ...tutorial(3),
  },
  {
    id: 'tutorial-showdown',
    game: true,
    title: "Tutorial, step 4: the Knight's showdown step, its markers partway through changing",
    ...tutorial(4, freezeMarkerChanges),
  },
  {
    id: 'tutorial-round-end',
    game: true,
    title: 'Tutorial, step 5: the round summary, the Badge and the set-aside card ringed',
    ...tutorial(5),
  },
  {
    id: 'tutorial-done',
    game: false,
    title: 'Tutorial at its finished page, with where to go next',
    ...tutorial(6),
  },
  {
    id: 'rules-goal',
    game: false,
    title: 'Rules: the goal',
    render: Rules,
    props: { section: 'goal' },
  },
  {
    id: 'rules-setup',
    game: false,
    title: 'Rules: setting up',
    render: Rules,
    props: { section: 'setup' },
  },
  {
    id: 'rules-round',
    game: false,
    title: 'Rules: a round in five steps',
    render: Rules,
    props: { section: 'round' },
  },
  {
    id: 'rules-markers',
    game: false,
    title: 'Rules: what each marker does',
    render: Rules,
    props: { section: 'markers' },
  },
  {
    id: 'rules-fine-points',
    game: false,
    title: 'Rules: the fine points',
    render: Rules,
    props: { section: 'fine-points' },
  },
  {
    id: 'rules-characters',
    game: false,
    title: 'Rules: every character and how to read abilities',
    render: Rules,
    props: { section: 'characters' },
  },
  {
    id: 'connection-banners',
    game: true,
    title: 'Table offline with the opponent away',
    ...table(opponentAwayState, undefined, OFFLINE),
  },
  {
    id: 'connection-claim-win',
    game: true,
    title: 'Table offering to claim the win once the opponent stays away',
    ...table(opponentGoneState),
  },
  {
    id: 'update-banner',
    game: false,
    title: 'Home with the update banner',
    ...staged({ screen: Home, stage: offerUpdate }),
  },
  {
    id: 'kit',
    game: false,
    title: 'Every kit component in each state',
    render: KitGallery,
    props: {},
  },
  {
    id: 'kit-sheet',
    game: false,
    title: 'Kit with a sheet open',
    ...staged({
      screen: KitGallery,
      act: async () => {
        await click('kit-open-sheet');
        const sheet = await byTestId('kit-sheet');
        await Promise.all(sheet.getAnimations?.().map((animation) => animation.finished) ?? []);
      },
    }),
  },
  {
    id: 'cards',
    mockup: 'cards-H',
    game: false,
    title: 'Every card at each size and in each state, and the ability legend',
    render: CardsGallery,
    props: {},
  },
  { id: 'kit-fit', game: true, title: 'A fitted game frame', render: FitStage, props: {} },
  {
    id: 'kit-fit-overflow',
    game: false,
    title: 'A fitted game frame with more than fits',
    render: FitStage,
    props: { overflow: true },
  },
];
