import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Command, EventKind, Game, Seat, TargetCard } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import { setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS, type Settings } from '../../src/settings/settings.js';
import {
  ONLINE,
  OPPONENT,
  hunterState,
  potionState,
  roundOverState,
} from '../../src/gallery/fixtures.js';
import OnlineTable from '../../src/gallery/OnlineTable.svelte';
import ShowdownList from '../../src/table/ShowdownList.svelte';
import { showdownSteps, type SequencedEvent } from '../../src/table/showdown.js';
import { newGame, playUntil } from '../games.js';

const localiser = createLocaliser('en');
const SEAT: Seat = 'p1';

afterEach(() => {
  setDisplaySettings(DEFAULT_SETTINGS);
  vi.useRealTimers();
});

/** A game whose first round has been played to the end. */
function afterShowdown(): Game {
  const game = newGame(12);
  playUntil(game, () => game.pending().kind === 'next_round');
  return game;
}

const isHunterPlan = (cmd: Command): boolean =>
  typeof cmd === 'object' &&
  'submit_plan' in cmd &&
  cmd.submit_plan.character === 'hunter' &&
  cmd.submit_plan.targets.length > 0;

/** A game waiting on a Hunter's owner to choose whether to spend a Cross. */
function atHunterChoice(): Game {
  for (let seed = 1; seed < 500; seed++) {
    const game = newGame(seed);
    try {
      playUntil(
        game,
        () => ['hunter_choice', 'next_round'].includes(game.pending().kind),
        (legal) => legal.find(isHunterPlan) ?? legal.find((c) => c !== 'resign'),
      );
    } catch {
      continue;
    }
    if (game.pending().kind === 'hunter_choice') return game;
  }
  throw new Error('no seed reaches a Hunter choice');
}

function renderList(game: Game, seat: Seat, settings: Partial<Settings> = {}) {
  setDisplaySettings({ ...DEFAULT_SETTINGS, ...settings });
  const viewer = { seat };
  const events = game.eventsSince(0, viewer);
  const onCommand = vi.fn<(cmd: Command) => void>();
  const onCaughtUp = vi.fn();
  render(ShowdownList, {
    props: { localiser, events, seat, legal: game.legalActions(seat), onCommand, onCaughtUp },
  });
  return { events, steps: showdownSteps(events), onCommand, onCaughtUp };
}

/** The results shown so far: the steps in the list, then the round summary that closes the round. */
const shownSteps = (): HTMLElement[] => [
  ...within(screen.getByTestId('showdown-steps')).queryAllByTestId('showdown-step'),
  ...screen.queryAllByTestId('round-summary'),
];

function sequenced(kinds: EventKind[]): SequencedEvent[] {
  return kinds.map((kind, seq) => [seq + 1, { visibility: 'public', kind }]);
}

/** A round whose Potion misses, whose Knight (p1) eliminates the Wolfen (p0), then ends. */
const ELIMINATION: EventKind[] = [
  { round_started: { round: 1, badge: 'p1' } },
  {
    plans_revealed: {
      plans: [
        { character: 'wolfen', targets: [{ character: 'knight' }] },
        { character: 'knight', targets: [{ character: 'wolfen' }] },
      ],
      effective: [4, 2],
      order: ['p1', 'p0'],
    },
  },
  { potion_resolved: { target: 'seer', victim: 'p0', hit: false, health_lost: 0 } },
  { character_resolved: { seat: 'p1', character: 'knight' } },
  { marker_gained: { seat: 'p1', marker: 'hourglass', from_opponent: false } },
  {
    attack_hit: {
      seat: 'p1',
      target_seat: 'p0',
      attacker: 'knight',
      character: 'wolfen',
      health_lost: 1,
    },
  },
  { round_ended: { round: 1, next_badge: 'p0' } },
  { discard_revealed: { round: 1, character: 'seer' } },
];

describe('showdownSteps', () => {
  it('groups the results after the reveal, one step per resolution', () => {
    const game = afterShowdown();
    const events = game.eventsSince(0, { seat: SEAT });
    const steps = showdownSteps(events);
    expect(steps.length).toBeGreaterThan(1);
    const first = steps[0]?.[0]?.[1].kind;
    expect(first && ('potion_resolved' in first || 'character_resolved' in first)).toBe(true);
    expect(steps.flat().some(([, e]) => 'plans_revealed' in e.kind)).toBe(false);
    expect(steps.at(-1)?.[0]?.[1].kind).toHaveProperty('round_ended');
  });

  it('is empty before the plans are revealed', () => {
    expect(showdownSteps(newGame(12).eventsSince(0, { seat: SEAT }))).toEqual([]);
  });
});

describe('ShowdownList', () => {
  it('showdown steps one at a time', async () => {
    const game = afterShowdown();
    const { steps, onCaughtUp } = renderList(game, SEAT, { showdownSpeed: 'step' });
    expect(shownSteps()).toHaveLength(1);
    const next = screen.getByRole('button', { name: 'Next result' });
    for (let n = 2; n <= steps.length; n++) {
      await userEvent.click(next);
      expect(shownSteps()).toHaveLength(n);
    }
    expect(screen.queryByRole('button', { name: 'Next result' })).toBeNull();
    expect(onCaughtUp).toHaveBeenCalledOnce();
    const text = shownSteps()[0]?.textContent ?? '';
    const firstEvent = steps[0]?.[0]?.[1];
    if (firstEvent === undefined) throw new Error('no step');
    expect(text).toContain(localiser.renderEvent(firstEvent, SEAT));
  });

  it('showdown steps are styled done, now and out', async () => {
    setDisplaySettings({ ...DEFAULT_SETTINGS, showdownSpeed: 'step' });
    render(ShowdownList, {
      props: {
        localiser,
        events: sequenced(ELIMINATION),
        seat: 'p1',
        legal: [],
        onCommand: () => {},
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Next result' }));
    const items = within(screen.getByTestId('showdown-steps')).getAllByRole('listitem');
    const styled = items.map((item) => ({
      done: item.classList.contains('done'),
      now: item.classList.contains('now'),
      out: item.classList.contains('out'),
      text: item.querySelector('.text')?.textContent?.replace(/\s+/g, ' ').trim(),
    }));
    expect(styled).toEqual([
      {
        done: true,
        now: false,
        out: false,
        text: expect.stringMatching(/^The Potion misses: your opponent did not play the Seer\.$/),
      },
      {
        done: false,
        now: true,
        out: false,
        text: expect.stringMatching(/^Your Knight resolves\. .*hits your opponent's Wolfen/),
      },
      {
        done: false,
        now: false,
        out: true,
        text: "Your opponent's Wolfen is eliminated and doesn't act.",
      },
    ]);
    const out = items[2]!;
    expect(out.dataset['testid']).toBe('showdown-out');
    expect(Array.from(out.querySelectorAll('strong'), (b) => b.textContent)).toEqual([
      'Your opponent',
      'Wolfen',
    ]);
    expect(screen.queryByTestId('round-summary'), 'the round has not ended yet').toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Next result' }));
    const summary = screen.getByTestId('round-summary');
    expect(summary.classList, 'the round end is the latest result').toContain('latest');
    expect(
      items.map((item) =>
        item.className.split(' ').filter((c) => ['done', 'now', 'out'].includes(c)),
      ),
      'every line before it is done',
    ).toEqual([['done'], ['done'], ['out']]);
  });

  it('the eliminated character shows only once its elimination does', async () => {
    setDisplaySettings({ ...DEFAULT_SETTINGS, showdownSpeed: 'step' });
    render(ShowdownList, {
      props: {
        localiser,
        events: sequenced(ELIMINATION),
        seat: 'p1',
        legal: [],
        onCommand: () => {},
      },
    });
    expect(screen.queryByTestId('showdown-out')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Next result' }));
    expect(screen.getByTestId('showdown-out')).toBeTruthy();
    expect(screen.queryByTestId('round-summary')).toBeNull();
  });

  /** A round in which the Potion hits `victim`'s character; p1 (the Knight) acts first. */
  const potionHits = (victim: Seat): EventKind[] => {
    const acting: Seat = victim === 'p1' ? 'p0' : 'p1';
    return [
      ELIMINATION[0]!,
      ELIMINATION[1]!,
      {
        potion_resolved: {
          target: victim === 'p1' ? 'knight' : 'wolfen',
          victim,
          hit: true,
          health_lost: 1,
        },
      },
      {
        character_resolved: {
          seat: acting,
          character: acting === 'p1' ? 'knight' : 'wolfen',
        },
      },
      { attack_missed: { seat: acting, attacker: acting === 'p1' ? 'knight' : 'wolfen' } },
      { round_ended: { round: 1, next_badge: 'p0' } },
    ];
  };

  const shownItems = () =>
    within(screen.getByTestId('showdown-steps'))
      .queryAllByRole('listitem')
      .map((item) =>
        item.classList.contains('out') ? 'out' : item.classList.contains('now') ? 'now' : 'done',
      );

  it("a Potion hit on the first seat's character puts its out line straight after the Potion", () => {
    setDisplaySettings({ ...DEFAULT_SETTINGS, showdownSpeed: 'step' });
    render(ShowdownList, {
      props: {
        localiser,
        events: sequenced(potionHits('p1')),
        seat: 'p1',
        legal: [],
        onCommand: () => {},
      },
    });
    expect(shownItems()).toEqual(['now', 'out']);
    expect(screen.getByTestId('showdown-out').textContent?.replace(/\s+/g, ' ')).toContain(
      "Your Knight is eliminated and doesn't act.",
    );
  });

  it("a Potion hit on the second seat's character shows its out line after the first seat acts", async () => {
    setDisplaySettings({ ...DEFAULT_SETTINGS, showdownSpeed: 'step' });
    render(ShowdownList, {
      props: {
        localiser,
        events: sequenced(potionHits('p0')),
        seat: 'p1',
        legal: [],
        onCommand: () => {},
      },
    });
    expect(shownItems(), 'not while only the Potion is shown').toEqual(['now']);
    await userEvent.click(screen.getByRole('button', { name: 'Next result' }));
    expect(shownItems()).toEqual(['done', 'now', 'out']);
    expect(screen.getByTestId('showdown-out').textContent?.replace(/\s+/g, ' ')).toContain(
      "Your opponent's Wolfen is eliminated and doesn't act.",
    );
  });

  it('showdown lines bold character names', () => {
    const game = afterShowdown();
    const { events } = renderList(game, SEAT, { showdownSpeed: 'instant' });
    const first = shownSteps()[0];
    const named = first?.querySelectorAll('strong') ?? [];
    expect(named.length).toBeGreaterThan(0);
    const played = events.flatMap(([, e]) =>
      'plans_revealed' in e.kind ? e.kind.plans_revealed.plans.map((p) => p.character) : [],
    );
    const names = played.map((c) => localiser.t(`character-${c.replaceAll('_', '-')}`));
    const bold = Array.from(named, (element) => element.textContent);
    expect(names.some((name) => bold.includes(name))).toBe(true);
    expect(bold).toContain('Your');
  });

  it('steps automatically every 1.2 seconds', async () => {
    vi.useFakeTimers();
    const game = afterShowdown();
    const { steps } = renderList(game, SEAT, { showdownSpeed: 'auto', reducedMotion: 'off' });
    expect(shownSteps()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Next result' })).toBeNull();
    vi.advanceTimersByTime(1_199);
    await tick();
    expect(shownSteps()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await tick();
    expect(shownSteps()).toHaveLength(Math.min(2, steps.length));
    vi.advanceTimersByTime(1_200 * steps.length);
    await tick();
    expect(shownSteps()).toHaveLength(steps.length);
  });

  it('instant under reduced motion', () => {
    const game = afterShowdown();
    const { steps } = renderList(game, SEAT, { showdownSpeed: 'auto', reducedMotion: 'on' });
    expect(shownSteps()).toHaveLength(steps.length);
    expect(screen.queryByRole('button', { name: 'Next result' })).toBeNull();
  });

  it('keeps stepping under reduced motion when the player chose it', () => {
    const game = afterShowdown();
    renderList(game, SEAT, { showdownSpeed: 'step', reducedMotion: 'on' });
    expect(shownSteps()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Next result' })).toBeTruthy();
  });

  it('shows the Hunter prompt inline once the results so far are shown', async () => {
    const game = atHunterChoice();
    const seat = game.pending().seats[0];
    if (seat === undefined) throw new Error('nobody to choose');
    const { steps, onCommand } = renderList(game, seat, { showdownSpeed: 'step' });
    for (let n = 1; n < steps.length; n++) {
      expect(screen.queryByTestId('action-hunter-spend')).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Next result' }));
    }
    const prompt = screen.getByTestId('hunter-prompt');
    expect(screen.getByRole('region', { name: 'Showdown' }).contains(prompt)).toBe(true);
    await userEvent.click(within(prompt).getByRole('button', { name: 'Keep the Cross' }));
    await userEvent.click(within(prompt).getByRole('button', { name: 'Spend a Cross to attack' }));
    expect(onCommand).toHaveBeenCalledExactlyOnceWith({ hunter_spend_cross: { spend: false } });
  });
});

describe('the showdown middle', () => {
  const name = (card: TargetCard): string =>
    localiser.t(
      card === 'fool' ? 'plan-summary-fool' : `character-${card.character.replaceAll('_', '-')}`,
    );

  it('each plan panel gives its order and its initiative on lines of their own', () => {
    render(OnlineTable, { props: { localiser, state: roundOverState(), connection: ONLINE } });
    const orders = (['p0', 'p1'] as const).map((seat) =>
      Array.from(
        screen.getByTestId(`plan-panel-${seat}`).querySelectorAll('[data-part="plan-order"]'),
        (line) => line.textContent?.trim(),
      ),
    );
    for (const lines of orders) {
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/^(First|Second)$/);
      expect(lines[1]).toMatch(/^Initiative \d+( → \d+)?$/);
    }
    expect(orders.map((lines) => lines[0]).sort()).toEqual(['First', 'Second']);
  });

  it('showdown replaces the reveal panels', () => {
    setDisplaySettings({ ...DEFAULT_SETTINGS, showdownSpeed: 'step' });
    const reveal = render(OnlineTable, {
      props: { localiser, state: potionState(), connection: ONLINE },
    });
    expect(screen.getByTestId('reveal')).toBeTruthy();
    expect(screen.queryByTestId('plan-panels')).toBeNull();
    reveal.unmount();

    for (const state of [hunterState(), roundOverState()]) {
      const { unmount } = render(OnlineTable, {
        props: { localiser, state, connection: ONLINE },
      });
      const middle = screen.getByTestId('phase-panels');
      expect(within(middle).queryByTestId('reveal'), 'no reveal panel').toBeNull();
      expect(
        within(middle).queryByRole('region', { name: 'Showdown order' }),
        'no separate order panel',
      ).toBeNull();
      expect(
        Array.from(middle.children)
          .filter((child) => !child.classList.contains('visually-hidden'))
          .map((child) => (child as HTMLElement).dataset['testid']),
        'the plan panels and the results, nothing under them',
      ).toEqual(['plan-panels', 'showdown']);

      const view = state.view!;
      for (const seat of ['p0', 'p1'] as const) {
        const plan = view.players[seat === 'p0' ? 0 : 1].plan;
        if (typeof plan !== 'object' || !('revealed' in plan)) throw new Error('not revealed');
        const panel = within(middle).getByTestId(`plan-panel-${seat}`);
        const card = panel.querySelector('.card');
        expect(card?.classList, 'a target-size card').toContain('target');
        const bold = Array.from(
          panel.querySelectorAll('[data-part="plan-line"] strong'),
          (b) => b.textContent,
        );
        expect(bold, `${seat}: its player, character and targets`).toEqual([
          seat === state.seat ? 'You' : OPPONENT,
          name({ character: plan.revealed.character }),
          ...plan.revealed.targets.map(name),
        ]);
      }
      unmount();
    }
  });
});
