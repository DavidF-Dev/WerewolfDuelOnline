import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Character, TargetCard as Card } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import AbilityLegend from '../../src/components/AbilityLegend.svelte';
import CharacterCard from '../../src/components/CharacterCard.svelte';
import TargetCard from '../../src/components/TargetCard.svelte';
import {
  CHARACTERS,
  TARGET_CARDS,
  faction,
  initiative,
  pillsOf,
  targetId,
} from '../../src/cards.js';
import { setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';

const localiser = createLocaliser('en');
const SIZES = ['large', 'medium', 'target'] as const;

afterEach(() => {
  vi.useRealTimers();
  setDisplaySettings(DEFAULT_SETTINGS);
});

function renderTarget(card: Card, props: Record<string, unknown> = {}) {
  return render(TargetCard, { props: { localiser, card, ...props } });
}

function renderCharacter(character: Character, props: Record<string, unknown> = {}) {
  return render(CharacterCard, { props: { localiser, character, ...props } });
}

/** The pill row's items as drawn, in order, written like the pills they draw. */
function drawnPills(scope: Element): string[] {
  const row = scope.querySelector('[data-part="pills"]');
  if (row === null) return [];
  return Array.from(row.children).map((item) => {
    const el = item as HTMLElement;
    if (el.dataset['pill'] === 'attack') {
      const { cost, targets, damage } = el.dataset;
      return `attack ${cost ?? 'null'} [${targets?.split(' ').join(', ')}] ${damage}`;
    }
    const icon = el.querySelector<HTMLElement>('[data-part="icon"]');
    const marker = icon?.querySelector('use')?.getAttribute('href')?.split('-').pop();
    return `${icon?.dataset['ring'] ?? 'other'} ${marker}`;
  });
}

const written = (character: Character): string[] =>
  pillsOf(character).map((pill) =>
    pill.kind === 'gain'
      ? `gain ${pill.marker}`
      : `attack ${pill.cost} [${pill.targets.join(', ')}] ${pill.damage}`,
  );

/** The drawn card around a card's button. */
const drawn = (button: HTMLElement): HTMLElement => button.parentElement!;

const parts = (scope: Element): string[] =>
  Array.from(scope.querySelectorAll<HTMLElement>('[data-part="face"] > [data-part]')).map(
    (el) => el.dataset['part']!,
  );

describe('cards', () => {
  it('drawn pills match the engine summary at every size', () => {
    for (const character of CHARACTERS) {
      for (const size of SIZES) {
        const { container, unmount } = renderCharacter(character, { size });
        expect(drawnPills(container), `${character} at ${size}`).toEqual(written(character));
        expect(
          container.querySelector('[data-part="pills"]')?.closest('[aria-hidden="true"]'),
        ).not.toBeNull();
        unmount();
      }
    }
    const fool = renderTarget('fool');
    expect(fool.container.querySelector('[data-part="pills"]')).toBeNull();
  });

  it('a gain is a ringed token, not a pill', () => {
    const { container } = renderCharacter('knight');
    const [gain, attack] = Array.from(container.querySelector('[data-part="pills"]')!.children);
    expect(gain?.getAttribute('data-part')).toBe('marker');
    expect(gain?.querySelector('[data-part="icon"]')?.getAttribute('data-ring')).toBe('gain');
    expect(gain?.querySelector('[data-part="icon"]')?.hasAttribute('data-token')).toBe(true);
    expect(gain?.hasAttribute('data-pill')).toBe(false);
    expect(gain?.textContent?.trim()).toBe('');
    expect(attack?.getAttribute('data-pill')).toBe('attack');
  });

  it('the attack arrow appears only with a cost', () => {
    for (const character of CHARACTERS) {
      const { container, unmount } = renderCharacter(character);
      for (const pill of Array.from(container.querySelectorAll<HTMLElement>('[data-pill]'))) {
        const arrows = pill.querySelectorAll('[data-part="spend"]');
        const cost = pill.dataset['cost'];
        expect(arrows, `${character} ${cost}`).toHaveLength(cost === undefined ? 0 : 1);
        if (cost !== undefined) {
          const token = pill.querySelector('[data-part="icon"][data-token]');
          expect(token?.closest('[data-part="marker"]')?.nextElementSibling).toBe(arrows[0]);
        }
      }
      unmount();
    }
  });

  it('hearts show only when a hit costs more than 1 Health', () => {
    for (const character of CHARACTERS) {
      const { container, unmount } = renderCharacter(character);
      const expected = pillsOf(character).flatMap((pill) =>
        pill.kind === 'attack' && pill.damage > 1 ? [pill.damage] : [],
      );
      const drawnHearts = Array.from(container.querySelectorAll('[data-part="damage"]')).map(
        (damage) => damage.querySelectorAll('svg').length,
      );
      expect(drawnHearts, character).toEqual(expected);
      unmount();
    }
    expect(
      CHARACTERS.some((c) => pillsOf(c).some((p) => p.kind === 'attack' && p.damage > 1)),
    ).toBe(true);
  });

  it('a card in hand shows the In hand pill instead of its pills', () => {
    const { container } = renderTarget({ character: 'knight' }, { size: 'target', inHand: true });
    const button = screen.getByRole('button');
    const pill = container.querySelector('[data-part="in-hand"]');
    expect(pill?.textContent).toBe('In hand');
    expect(container.querySelector('[data-part="pills"]')?.children).toHaveLength(1);
    expect(container.querySelector('[data-pill]')).toBeNull();
    expect(button.getAttribute('aria-describedby')?.split(' ')).toContain(pill?.id);
    expect(document.getElementById(pill!.id)).toBe(pill);
    expect(container.querySelector('[data-part="tag"]')).toBeNull();
  });

  it('card text puts a token before each marker name', () => {
    const { container } = renderCharacter('knight', { size: 'medium' });
    const text = container.querySelector('[data-part="text"]');
    expect(text?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Gain an Hourglass, then attack a Werewolf.',
    );
    const marker = text?.querySelector('[data-part="marker"]');
    expect(marker?.textContent).toBe('Hourglass');
    expect(marker?.firstElementChild?.hasAttribute('data-token')).toBe(true);
    const target = renderCharacter('knight', { size: 'target' });
    expect(target.container.querySelector('[data-part="text"]')).toBeNull();
  });

  it('text-only card text hides the glyph and the pills', () => {
    setDisplaySettings({ ...DEFAULT_SETTINGS, cardText: 'text-only' });
    for (const size of SIZES) {
      const { container, unmount } = renderCharacter('knight', { size });
      expect(container.querySelector('[data-part="glyph"]')).toBeNull();
      expect(container.querySelector('[data-part="pills"]')).toBeNull();
      expect(container.querySelector('[data-part="name"]')?.textContent).toBe('Knight');
      unmount();
    }
    const { container } = renderTarget({ character: 'knight' }, { size: 'target', inHand: true });
    expect(container.querySelector('[data-part="in-hand"]')).not.toBeNull();
  });

  it('target and medium cards show the large card on keyboard focus', async () => {
    for (const size of ['target', 'medium'] as const) {
      const user = userEvent.setup();
      const onselect = vi.fn();
      const { container, unmount } = renderTarget({ character: 'knight' }, { size, onselect });
      expect(container.querySelector('[data-part="popover"]')).toBeNull();

      await user.tab();
      const popover = container.querySelector('[data-part="popover"]');
      expect(popover).not.toBeNull();
      expect(popover!.getAttribute('aria-hidden')).toBe('true');
      expect(popover!.querySelector('.face')?.classList.contains('large')).toBe(true);
      expect(drawnPills(popover!)).toEqual(written('knight'));
      expect(popover!.textContent).toContain('Knight');
      expect(onselect).not.toHaveBeenCalled();

      await user.keyboard('{Escape}');
      expect(container.querySelector('[data-part="popover"]')).toBeNull();

      await user.tab({ shift: true });
      await user.tab();
      expect(container.querySelector('[data-part="popover"]')).not.toBeNull();
      await user.tab();
      expect(container.querySelector('[data-part="popover"]')).toBeNull();
      unmount();
    }
  });

  it('a disabled card shows its reason on keyboard focus or a tap, and never selects', async () => {
    const user = userEvent.setup();
    const onselect = vi.fn();
    const { container } = renderTarget(
      { character: 'seer' },
      { size: 'target', state: 'disabled', reason: 'Not now.', onselect },
    );
    const shown = () => container.querySelector('[data-part="reason"]')?.textContent ?? null;
    expect(shown()).toBeNull();

    await user.tab();
    expect(shown()).toBe('Not now.');
    expect(container.querySelector('[data-part="popover"]')).not.toBeNull();
    await user.tab();
    expect(shown()).toBeNull();

    await user.click(screen.getByRole('button'));
    expect(shown()).toBe('Not now.');
    expect(container.querySelector('[data-part="popover"]')).toBeNull();
    await fireEvent.pointerDown(document.body);
    expect(shown()).toBeNull();
    expect(onselect).not.toHaveBeenCalled();
  });

  it('a large card has no popover', async () => {
    const user = userEvent.setup();
    const { container } = renderTarget({ character: 'knight' }, { size: 'large' });
    await user.tab();
    expect(container.querySelector('[data-part="popover"]')).toBeNull();
  });

  it('a normal tap on a target card selects it without the popover', async () => {
    const user = userEvent.setup();
    const onselect = vi.fn();
    const { container } = renderTarget({ character: 'seer' }, { size: 'target', onselect });
    await user.click(screen.getByRole('button'));
    expect(onselect).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-part="popover"]')).toBeNull();
  });

  it('a tap that focuses the card after the pointer is up does not open the popover', async () => {
    const onselect = vi.fn();
    const { container } = renderTarget({ character: 'witch' }, { size: 'target', onselect });
    const card = screen.getByRole('button');
    await fireEvent.pointerDown(card, { button: 0, isPrimary: true });
    await fireEvent.pointerUp(card, { button: 0, isPrimary: true });
    card.focus();
    await fireEvent.click(card, { detail: 1 });
    expect(document.activeElement).toBe(card);
    expect(container.querySelector('[data-part="popover"]')).toBeNull();
    expect(onselect).toHaveBeenCalledOnce();
  });

  it('Tab after a press that left the card unfocused opens the popover', async () => {
    const user = userEvent.setup();
    const { container } = renderTarget({ character: 'witch' }, { size: 'target' });
    const card = screen.getByRole('button');
    await fireEvent.pointerDown(card, { button: 0, isPrimary: true });
    await fireEvent.pointerUp(card, { button: 0, isPrimary: true });
    expect(document.activeElement).not.toBe(card);
    await user.tab();
    expect(document.activeElement).toBe(card);
    expect(container.querySelector('[data-part="popover"]')).not.toBeNull();
  });

  it('a long press on a target card reveals the large card without selecting it', async () => {
    vi.useFakeTimers();
    const onselect = vi.fn();
    const { container } = renderTarget('fool', { size: 'target', onselect });
    const card = screen.getByRole('button');
    await fireEvent.pointerDown(card, { button: 0, isPrimary: true });
    await vi.advanceTimersByTimeAsync(499);
    expect(container.querySelector('[data-part="popover"]')).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(container.querySelector('[data-part="popover"]')).not.toBeNull();
    await fireEvent.pointerUp(card, { button: 0, isPrimary: true });
    await fireEvent.click(card, { detail: 1 });
    expect(onselect).not.toHaveBeenCalled();
    expect(container.querySelector('[data-part="popover"]')).not.toBeNull();

    await fireEvent.pointerDown(document.body);
    expect(container.querySelector('[data-part="popover"]')).toBeNull();
  });

  it('card accessible names are unchanged', () => {
    const expected: Array<[Card, string]> = [
      [{ character: 'knight' }, '3, Knight, Human. Gain an Hourglass, then attack a Werewolf.'],
      [
        { character: 'wolf_king' },
        '2, Wolf King, Werewolf. Attack any number of Humans. Each Human after the first costs a Fang, or there is no attack.',
      ],
      [
        { character: 'hunter' },
        '1, Hunter, Human. You may spend a Cross to attack up to 2 Werewolves.',
      ],
      ['fool', 'The Fool. No effect. Add it to any plan to bluff.'],
    ];
    for (const size of SIZES) {
      for (const [card, name] of expected) {
        const { unmount } = renderTarget(card, { size });
        expect(screen.getByRole('button').getAttribute('aria-label')).toBe(name);
        unmount();
      }
      for (const card of TARGET_CARDS) {
        for (const inHand of [false, true]) {
          const { unmount } = renderTarget(card, { size, inHand });
          const button = screen.getByRole('button');
          expect(button.childElementCount).toBe(0);
          for (const child of Array.from(drawn(button).children).filter((el) => el !== button)) {
            expect(child.getAttribute('aria-hidden')).toBe('true');
          }
          // Any word drawn on the card is in its name or description, so a speech user can say what they see.
          const described = (button.getAttribute('aria-describedby') ?? '')
            .split(' ')
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ');
          const heard = `${button.getAttribute('aria-label')} ${described}`.toLowerCase();
          const words = (drawn(button).textContent ?? '')
            .split(/[\s.,:/]+/)
            .filter((w) => /\w/.test(w));
          for (const word of words) {
            expect(heard, `${targetId(card)} at ${size}`).toContain(word.toLowerCase());
          }
          unmount();
        }
      }
    }
  });

  it('cards follow the design note anatomy', () => {
    for (const character of CHARACTERS) {
      for (const size of ['large', 'medium'] as const) {
        const card = renderCharacter(character, { size });
        const button = drawn(card.getByRole('button'));
        expect(parts(button), `${character} at ${size}`).toEqual(['top', 'art', 'pills', 'text']);
        const top = button.querySelector('[data-part="top"]')!;
        expect(
          Array.from(top.querySelectorAll<HTMLElement>('[data-part]')).map(
            (el) => el.dataset['part'],
          ),
        ).toEqual(['initiative', 'name', 'faction']);
        expect(top.querySelector('[data-part="initiative"]')?.textContent).toBe(
          String(initiative(character)),
        );
        expect(top.querySelector<HTMLElement>('[data-part="faction"]')?.dataset['faction']).toBe(
          faction(character),
        );
        card.unmount();
      }
      const target = renderCharacter(character, { size: 'target' });
      const button = drawn(target.getByRole('button'));
      expect(parts(button)).toEqual(['top', 'art', 'pills']);
      expect(
        Array.from(button.querySelectorAll<HTMLElement>('[data-part="art"] > [data-part]')).map(
          (el) => el.dataset['part'],
        ),
      ).toEqual(['initiative', 'glyph', 'faction']);
      target.unmount();
    }
    const fool = renderTarget('fool');
    const button = drawn(fool.getByRole('button'));
    expect(parts(button)).toEqual(['top', 'art', 'text']);
    expect(button.querySelector('[data-part="initiative"]')?.textContent).toBe('–');
    expect(button.querySelector('[data-part="faction"]')).toBeNull();
  });

  it('faction is shown by the art pattern and icon, not colour alone', () => {
    const human = renderCharacter('knight');
    const werewolf = renderCharacter('wolfen');
    const pattern = (c: HTMLElement) =>
      c.querySelector<HTMLElement>('[data-part="art"]')?.dataset['pattern'];
    expect(pattern(human.container)).toBe('tinted');
    expect(pattern(werewolf.container)).toBe('hatched');
    const icon = (c: HTMLElement) =>
      c.querySelector('[data-part="faction"] use')?.getAttribute('href');
    expect(icon(human.container)).not.toBe(icon(werewolf.container));
  });

  it('ability legend shows gain, attack, damage and spend', () => {
    const { container } = render(AbilityLegend, { props: { localiser } });
    expect(screen.getByRole('heading', { name: 'How to read abilities' })).toBeTruthy();
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-legend]'));
    expect(rows.map((row) => row.dataset['legend'])).toEqual(['gain', 'attack', 'damage', 'spend']);
    const terms = rows.map((row) => row.querySelector('dt .visually-hidden')?.textContent);
    expect(terms).toEqual(['Gain', 'Attack', 'Extra damage', 'Spend']);
    expect(rows[0]!.querySelector('[data-ring="gain"]')).not.toBeNull();
    const attack = rows[1]!.querySelector('dd')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(attack).toMatch(/^Attack one character for each shape\. /);
    for (const word of ['Werewolf', 'Human', 'Any character']) expect(attack).toContain(word);
    expect(rows[1]!.querySelectorAll('dd li')).toHaveLength(3);
    expect(rows[1]!.querySelectorAll('dd svg')).toHaveLength(4);
    expect(rows[2]!.querySelector('[data-part="damage"]')).not.toBeNull();
    expect(rows[3]!.querySelector('[data-part="spend"]')).not.toBeNull();
    for (const row of rows) {
      expect(row.querySelector('.sample')?.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
