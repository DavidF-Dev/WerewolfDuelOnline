import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultRulesConfig, type Character, type Command, type TargetCard } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import { setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';
import PlanSheet from '../../src/table/PlanSheet.svelte';
import { gameDealing } from '../games.js';

const localiser = createLocaliser('en');
const WEREWOLVES: Character[] = ['wolf_king', 'wolfen', 'wolf_beauty'];
const HUMANS: Character[] = ['hunter', 'knight', 'seer', 'witch', 'villager'];

afterEach(() => setDisplaySettings(DEFAULT_SETTINGS));

const sameTargets = (a: TargetCard[], b: TargetCard[]): boolean =>
  JSON.stringify(a.map((t) => JSON.stringify(t)).sort()) ===
  JSON.stringify(b.map((t) => JSON.stringify(t)).sort());

function setUp(confirmPlan = false, cards: Character[] = ['knight', 'seer', 'villager']) {
  setDisplaySettings({ ...DEFAULT_SETTINGS, confirmPlan });
  const game = gameDealing('p0', cards);
  const hand = game.view({ seat: 'p0' }).players[0].hand ?? [];
  const legal = game.legalActions('p0');
  const onCommand = vi.fn<(cmd: Command) => void>();
  render(PlanSheet, {
    props: { localiser, hand, legal, config: defaultRulesConfig(), onCommand },
  });
  /** The engine's own legal entry for this plan. */
  const entry = (character: Character, targets: TargetCard[]): Command | undefined =>
    legal.find(
      (cmd) =>
        typeof cmd === 'object' &&
        'submit_plan' in cmd &&
        cmd.submit_plan.character === character &&
        sameTargets(cmd.submit_plan.targets, targets),
    );
  const characters = within(screen.getByTestId('plan-characters'));
  const choose = (name: RegExp) => userEvent.click(characters.getByRole('button', { name }));
  const seal = (): HTMLButtonElement => screen.getByTestId('seal-plan') as HTMLButtonElement;
  return { onCommand, characters, choose, seal, entry, hand };
}

const target = (id: string): HTMLElement => screen.getByTestId(`target-${id}`);
/** The cards in the Targets panel, which take no choice until a character is chosen. */
const shownTargets = (): HTMLElement[] =>
  within(screen.getByRole('region', { name: 'Targets' })).getAllByRole('button');

/** A Human not in `hand`, which the Knight can't target. */
function otherHuman(hand: readonly Character[]): Character {
  const human = HUMANS.find((c) => !hand.includes(c));
  if (human === undefined) throw new Error('unexpected deal');
  return human;
}

/** The text of whatever describes `element`. */
const description = (element: HTMLElement): string =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');

describe('PlanSheet', () => {
  it('offers each hand card, named with its initiative and faction', () => {
    const { characters, hand } = setUp();
    expect(characters.getAllByRole('button')).toHaveLength(hand.length);
    expect(characters.getByRole('button', { name: /^3, Knight, Human[.]/ })).toBeTruthy();
  });

  it('tapping a hand card chooses the character', async () => {
    const { choose, onCommand } = setUp();
    for (const card of shownTargets()) {
      expect(card.getAttribute('aria-disabled')).toBeNull();
      expect(card.getAttribute('aria-pressed')).toBeNull();
      expect(card.getAttribute('data-testid')).toBeNull();
    }
    await choose(/^[0-9], Knight,/);
    expect(screen.getByTestId('plan-character-knight').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('plan-character-seer').getAttribute('aria-pressed')).toBe('false');
    expect(target('wolfen').getAttribute('aria-disabled')).toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
  });

  // The 7 px rise itself is measured in the browser.
  it('the chosen hand card is drawn selected in a Your hand region', async () => {
    const { choose } = setUp();
    const frame = (c: Character) =>
      screen.getByTestId(`plan-character-${c}`).closest('.frame') as HTMLElement;
    expect(
      ['knight', 'seer', 'villager'].map((c) =>
        frame(c as Character).classList.contains('selected'),
      ),
    ).toEqual([false, false, false]);
    await choose(/^[0-9], Seer,/);
    expect(frame('seer').classList.contains('selected')).toBe(true);
    expect(frame('seer').classList.contains('medium')).toBe(true);
    expect(frame('knight').classList.contains('selected')).toBe(false);
    expect(screen.getByTestId('plan-characters').closest('section')?.textContent).toContain(
      'Your hand',
    );
  });

  it('tapping a target card toggles it only when legal', async () => {
    const { choose, hand } = setUp();
    const human = otherHuman(hand);
    await userEvent.click(shownTargets().find((t) => /Wolfen/.test(t.ariaLabel ?? ''))!);
    await choose(/^[0-9], Knight,/);
    expect(target('wolfen').getAttribute('aria-pressed'), 'a tap before the character').toBe(
      'false',
    );
    await userEvent.click(target(human));
    expect(target(human).getAttribute('aria-pressed')).toBe('false');
    target(human).focus();
    await userEvent.keyboard('{Enter}');
    expect(target(human).getAttribute('aria-pressed'), 'nor by the keyboard').toBe('false');
    await userEvent.click(target('wolfen'));
    expect(target('wolfen').getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(target('wolf_king'));
    expect(target('wolf_king').getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(target('wolfen'));
    expect(target('wolfen').getAttribute('aria-pressed')).toBe('false');
  });

  it('pressing the chosen hand card again clears the choice and its targets', async () => {
    const { choose, seal } = setUp();
    await choose(/^[0-9], Knight,/);
    await userEvent.click(target('wolfen'));
    await choose(/^[0-9], Knight,/);
    expect(screen.getByTestId('plan-character-knight').getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByTestId('target-wolfen')).toBeNull();
    expect(shownTargets().filter((t) => t.getAttribute('aria-pressed') !== null)).toEqual([]);
    expect(seal().disabled).toBe(true);
    await choose(/^[0-9], Knight,/);
    expect(screen.getByTestId('plan-character-knight').getAttribute('aria-pressed')).toBe('true');
    expect(target('wolfen').getAttribute('aria-pressed')).toBe('false');
  });

  it('a target that cannot be chosen shows its reason when tapped', async () => {
    const { choose, hand } = setUp();
    const human = otherHuman(hand);
    await choose(/^[0-9], Knight,/);
    const slot = (id: string) => target(id).closest('.slot') as HTMLElement;
    expect(slot(human).querySelector('[data-part="reason"]')).toBeNull();
    await userEvent.click(target(human));
    expect(slot(human).querySelector('[data-part="reason"]')?.textContent).toBe(
      localiser.t('error-target-not-allowed'),
    );
    await userEvent.click(target('wolfen'));
    expect(slot(human).querySelector('[data-part="reason"]')).toBeNull();
  });

  it("disallowed targets show the engine's reason", async () => {
    const { choose, hand } = setUp();
    await choose(/^[0-9], Knight,/);
    for (const human of HUMANS.filter((c) => !hand.includes(c))) {
      expect(target(human).getAttribute('aria-disabled'), human).toBe('true');
      expect(description(target(human))).toContain(localiser.t('error-target-not-allowed'));
    }
    for (const werewolf of WEREWOLVES.filter((c) => !hand.includes(c))) {
      expect(target(werewolf).getAttribute('aria-disabled'), werewolf).toBeNull();
    }
    await userEvent.click(target('wolfen'));
    expect(target('wolfen').getAttribute('aria-pressed')).toBe('true');
    expect(target('wolf_king').getAttribute('aria-disabled')).toBe('true');
    expect(description(target('wolf_king'))).toContain(localiser.t('error-too-many-targets'));
    expect(target('fool').getAttribute('aria-disabled')).toBeNull();
  });

  it('leaves the cards in my own hand out of the targets', async () => {
    const { choose, hand } = setUp(false, ['wolf_king', 'knight']);
    await choose(/^[0-9], Wolf King,/);
    for (const c of hand) expect(screen.queryByTestId(`target-${c}`), c).toBeNull();
    expect(shownTargets()).toHaveLength(9 - hand.length);
    expect(target(otherHuman(hand)).getAttribute('aria-disabled')).toBeNull();
  });

  it('summarises the plan as it is built', async () => {
    const { choose } = setUp();
    await choose(/^[0-9], Knight,/);
    await userEvent.click(target('fool'));
    await userEvent.click(target('wolfen'));
    const summary = screen.getByTestId('plan-summary');
    expect(summary.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      'Knight → Wolfen + Fool',
    );
    expect(summary.textContent).toContain('Knight targeting the Wolfen and the Fool');
  });

  it('seals the engine entry whatever the click order', async () => {
    const { choose, seal, onCommand, entry } = setUp();
    await choose(/^[0-9], Seer,/);
    expect(seal().disabled).toBe(true);
    await userEvent.click(target('fool'));
    await userEvent.click(target('wolf_beauty'));
    await userEvent.click(seal());
    const expected = entry('seer', ['fool', { character: 'wolf_beauty' }]);
    expect(expected).toBeDefined();
    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand.mock.calls[0]?.[0]).toBe(expected);
  });

  it('confirm dialog appears only with the setting', async () => {
    const first = setUp(false);
    await first.choose(/^[0-9], Villager,/);
    await userEvent.click(first.seal());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(first.onCommand).toHaveBeenCalledExactlyOnceWith(first.entry('villager', ['fool']));
    document.body.innerHTML = '';

    const second = setUp(true);
    await second.choose(/^[0-9], Villager,/);
    await userEvent.click(second.seal());
    const dialog = screen.getByRole('alertdialog', { name: 'Seal this plan?' });
    expect(dialog.textContent).toContain('Villager targeting the Fool');
    expect(within(dialog).getByTestId('plan-hint').textContent).toBe(localiser.t('hint-plan'));
    expect(second.onCommand).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep choosing' }));
    expect(second.onCommand).not.toHaveBeenCalled();
    await userEvent.click(second.seal());
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Seal plan' }),
    );
    expect(second.onCommand).toHaveBeenCalledExactlyOnceWith(second.entry('villager', ['fool']));
  });

  it('sends a plan once however often Seal is pressed', async () => {
    const { choose, seal, onCommand } = setUp();
    await choose(/^[0-9], Villager,/);
    expect(seal().querySelector('[data-part="spinner"]')).toBeNull();
    await userEvent.dblClick(seal());
    await userEvent.click(seal());
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(seal().getAttribute('aria-disabled')).toBe('true');
    expect(seal().querySelector('[data-part="spinner"]')?.getAttribute('aria-hidden')).toBe('true');
    expect(seal().textContent?.trim()).toBe('Seal plan');
  });

  it('clears the targets when the character changes', async () => {
    const { choose, seal } = setUp();
    await choose(/^[0-9], Knight,/);
    await userEvent.click(target('wolfen'));
    await choose(/^[0-9], Seer,/);
    expect(target('wolfen').getAttribute('aria-pressed')).toBe('false');
    expect(seal().disabled).toBe(true);
  });
});
