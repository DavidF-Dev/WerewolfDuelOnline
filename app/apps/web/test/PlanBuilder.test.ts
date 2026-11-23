import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Character, Command, TargetCard } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import PlanBuilder from '../src/components/PlanBuilder.svelte';
import { gameDealing } from './games.js';

const WEREWOLVES: Character[] = ['wolf_king', 'wolfen', 'wolf_beauty'];
const HUMANS: Character[] = ['hunter', 'knight', 'seer', 'witch', 'villager'];

const sameTargets = (a: TargetCard[], b: TargetCard[]): boolean =>
  JSON.stringify(a.map((t) => JSON.stringify(t)).sort()) ===
  JSON.stringify(b.map((t) => JSON.stringify(t)).sort());

function setUp() {
  const game = gameDealing('p0', ['knight', 'seer', 'villager']);
  const hand = game.view({ seat: 'p0' }).players[0].hand ?? [];
  const legal = game.legalActions('p0');
  const onCommand = vi.fn<(cmd: Command) => void>();
  render(PlanBuilder, {
    props: { localiser: createLocaliser('en'), hand, legal, onCommand },
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
  const seal = screen.getByRole('button', { name: 'Seal plan' }) as HTMLButtonElement;
  return { onCommand, characters, seal, entry, hand, user: userEvent.setup() };
}

const target = (id: string): HTMLButtonElement =>
  screen.getByTestId(`target-${id}`) as HTMLButtonElement;

describe('PlanBuilder seals only legal plans', () => {
  it('offers each hand card, named with its initiative and faction', () => {
    const { characters, hand } = setUp();
    expect(characters.getAllByRole('button')).toHaveLength(hand.length);
    expect(characters.getByRole('button', { name: 'Knight, initiative 3, Human' })).toBeTruthy();
    expect(characters.getByRole('button', { name: 'Villager, initiative 8, Human' })).toBeTruthy();
  });

  it('explains once that a character comes first', () => {
    setUp();
    const notes = screen.getAllByText('Choose a character first.');
    expect(notes).toHaveLength(1);
    expect(target('fool').disabled).toBe(true);
    expect(target('fool').getAttribute('aria-describedby')).toBe(notes[0]?.id);
  });

  it('disables human targets for the Knight, with a reason', async () => {
    const { characters, user } = setUp();
    await user.click(characters.getByRole('button', { name: /^Knight/ }));
    for (const human of HUMANS) {
      const toggle = target(human);
      expect(toggle.disabled, human).toBe(true);
      const describedBy = toggle.getAttribute('aria-describedby') ?? '';
      expect(document.getElementById(describedBy)?.textContent).toContain("can't target");
    }
    for (const werewolf of WEREWOLVES) expect(target(werewolf).disabled, werewolf).toBe(false);
    expect(target('fool').disabled).toBe(false);
  });

  it('enables sealing for Knight on the Wolfen and emits the legal entry', async () => {
    const { characters, seal, onCommand, entry, user } = setUp();
    await user.click(characters.getByRole('button', { name: /^Knight/ }));
    expect(seal.disabled).toBe(true);
    await user.click(target('wolfen'));
    expect(target('wolfen').getAttribute('aria-pressed')).toBe('true');
    expect(seal.disabled).toBe(false);
    await user.click(seal);
    const expected = entry('knight', [{ character: 'wolfen' }]);
    expect(expected).toBeDefined();
    expect(onCommand).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it('blocks a second werewolf target once one is chosen', async () => {
    const { characters, user } = setUp();
    await user.click(characters.getByRole('button', { name: /^Knight/ }));
    await user.click(target('wolfen'));
    expect(target('wolf_king').disabled).toBe(true);
    expect(target('fool').disabled).toBe(false);
  });

  it('emits the engine entry whatever the click order', async () => {
    const { characters, seal, onCommand, entry, user } = setUp();
    await user.click(characters.getByRole('button', { name: /^Seer/ }));
    await user.click(target('fool'));
    await user.click(target('wolf_beauty'));
    await user.click(seal);
    const expected = entry('seer', ['fool', { character: 'wolf_beauty' }]);
    expect(expected).toBeDefined();
    expect(onCommand.mock.calls[0]?.[0]).toBe(expected);
  });

  it('keeps the Villager unsealable until the Fool is added', async () => {
    const { characters, seal, onCommand, entry, user } = setUp();
    await user.click(characters.getByRole('button', { name: /^Villager/ }));
    expect(seal.disabled).toBe(true);
    await user.click(seal);
    expect(onCommand).not.toHaveBeenCalled();
    await user.click(target('fool'));
    expect(seal.disabled).toBe(false);
    await user.click(seal);
    expect(onCommand).toHaveBeenCalledExactlyOnceWith(entry('villager', ['fool']));
  });

  it('sends a plan once however often Seal is pressed', async () => {
    const { characters, seal, onCommand, user } = setUp();
    await user.click(characters.getByRole('button', { name: /^Villager/ }));
    await user.click(target('fool'));
    await user.dblClick(seal);
    await user.click(seal);
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(seal.getAttribute('aria-disabled')).toBe('true');
  });

  it('clears the targets when the character changes', async () => {
    const { characters, seal, user } = setUp();
    await user.click(characters.getByRole('button', { name: /^Knight/ }));
    await user.click(target('wolfen'));
    await user.click(characters.getByRole('button', { name: /^Villager/ }));
    expect(target('wolfen').getAttribute('aria-pressed')).toBe('false');
    expect(seal.disabled).toBe(true);
  });
});
