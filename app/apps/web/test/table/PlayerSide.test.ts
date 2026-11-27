import { render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { Character, TargetCard } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import PlayerSide from '../../src/table/PlayerSide.svelte';
import { planText } from '../../src/text.js';

const localiser = createLocaliser('en');

type Props = {
  who: 'you' | 'opponent';
  character: Character | null;
  initiative: { printed: number; effective: number } | null;
  targets: readonly TargetCard[] | null;
  placed: number | 'choosing' | null;
};

const KNIGHT: Props = {
  who: 'you',
  character: 'knight',
  initiative: { printed: 4, effective: 4 },
  targets: [{ character: 'wolfen' }, 'fool'],
  placed: null,
};

const FACE_DOWN: Props = {
  who: 'opponent',
  character: null,
  initiative: null,
  targets: null,
  placed: 'choosing',
};

function renderSide(props: Props) {
  const result = render(PlayerSide, { props: { localiser, ...props } });
  const side = result.container.querySelector<HTMLElement>('[role="group"]')!;
  const part = (name: string): HTMLElement | null =>
    side.querySelector<HTMLElement>(`[data-part="${name}"]`);
  const chips = (): string[] =>
    Array.from(
      side.querySelectorAll<HTMLElement>('[data-part="side-target"]:not([hidden])'),
      (chip) => chip.textContent?.trim() ?? '',
    );
  return { ...result, side, part, chips };
}

/** Lays the chips out two to a row, 20 px apart, as `offsetTop` reports them. */
function twoChipsARow(): () => void {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop');
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      const parent = this.parentElement;
      if (parent === null || this.hidden) return 0;
      const shown = Array.from(parent.children).filter((child) => !(child as HTMLElement).hidden);
      return Math.floor(shown.indexOf(this) / 2) * 20;
    },
  });
  return () => {
    if (original !== undefined) Object.defineProperty(HTMLElement.prototype, 'offsetTop', original);
  };
}

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

describe('PlayerSide', () => {
  it('shows You or Opponent and the initiative on one line each', () => {
    for (const [props, who] of [
      [KNIGHT, 'You'],
      [{ ...KNIGHT, who: 'opponent' }, 'Opponent'],
    ] as const) {
      const { part, unmount } = renderSide(props);
      const line1 = part('side-who')!;
      const line2 = part('side-initiative')!;
      expect(line1.textContent?.trim()).toBe(who);
      expect(line2.textContent?.trim()).toBe('Initiative 4');
      for (const line of [line1, line2]) {
        expect(line.style.whiteSpace, 'a fitted one-line label').toBe('nowrap');
      }
      unmount();
    }
  });

  it('a changed initiative reads 4 → 3', () => {
    const { part, side } = renderSide({ ...KNIGHT, initiative: { printed: 4, effective: 3 } });
    expect(part('side-initiative')?.textContent?.trim()).toBe('Initiative 4 → 3');
    expect(side.getAttribute('aria-label')).toContain('Initiative 3 (printed 4)');
  });

  it('a face-down side reads Initiative ? and shows the pill', () => {
    const { part, side, chips } = renderSide(FACE_DOWN);
    expect(part('side-who')?.textContent?.trim()).toBe('Opponent');
    const initiative = part('side-initiative')!;
    expect(initiative.textContent?.trim()).toBe('Initiative ?');
    expect(initiative.classList).toContain('muted');
    expect(side.querySelector('.card'), 'no character card').toBeNull();
    expect(part('side-face-down')).not.toBeNull();
    expect(part('side-pill')).not.toBeNull();
    expect(chips()).toEqual([]);
    expect(side.getAttribute('aria-label')).toBe(
      'Opponent: character face down, initiative unknown.',
    );
  });

  it('the pill reads +?, +0 and +n, muted for +? and +0', () => {
    for (const [placed, text, name, muted] of [
      ['choosing', '+?', 'Still choosing Hourglasses', true],
      [0, '+0', 'Placed 0 Hourglasses', true],
      [1, '+1', 'Placed 1 Hourglass', false],
      [3, '+3', 'Placed 3 Hourglasses', false],
    ] as const) {
      const { part, unmount } = renderSide({ ...FACE_DOWN, placed });
      const pill = part('side-pill')!;
      expect(pill.textContent?.trim(), String(placed)).toBe(text);
      expect(pill.getAttribute('role')).toBe('img');
      expect(pill.getAttribute('aria-label')).toBe(name);
      expect(pill.classList.contains('muted'), `${text} muted`).toBe(muted);
      expect(pill.querySelector('[data-part="marker"].hourglass'), 'an Hourglass token').not.toBe(
        null,
      );
      unmount();
    }
  });

  it('one chip per target in card order', () => {
    const targets: TargetCard[] = ['fool', { character: 'wolfen' }, { character: 'wolf_king' }];
    const { chips, part, side } = renderSide({ ...KNIGHT, targets });
    expect(chips()).toEqual(['→ Fool', '→ Wolfen', '→ Wolf King']);
    expect(part('side-more')?.hidden, 'no "+n" while every chip fits').toBe(true);
    expect(part('side-pill'), 'chips instead of the pill').toBeNull();
    expect(side.getAttribute('aria-label')).toBe(
      `You: ${planText(localiser, { character: 'knight', targets })}. Initiative 4.`,
    );
  });

  it('five targets show two rows and +n', () => {
    restore = twoChipsARow();
    const targets: TargetCard[] = [
      { character: 'hunter' },
      { character: 'knight' },
      { character: 'seer' },
      { character: 'witch' },
      { character: 'villager' },
    ];
    const { chips, part, side } = renderSide({
      ...KNIGHT,
      character: 'wolf_king',
      initiative: { printed: 2, effective: 2 },
      targets,
    });
    expect(chips()).toEqual(['→ Hunter', '→ Knight', '→ Seer']);
    const more = part('side-more')!;
    expect(more.hidden).toBe(false);
    expect(more.textContent?.trim()).toBe('+2');
    const shown = Array.from(part('side-targets')!.children).filter(
      (child) => !(child as HTMLElement).hidden,
    );
    expect(new Set(shown.map((child) => (child as HTMLElement).offsetTop)).size).toBe(2);
    const label = side.getAttribute('aria-label') ?? '';
    for (const name of ['Hunter', 'Knight', 'Seer', 'Witch', 'Villager']) {
      expect(label, `the full list names the ${name}`).toContain(name);
    }
  });

  it('a showdown side says in its name whether it acts first or second', () => {
    for (const [position, said] of [
      [1, 'Acts first.'],
      [2, 'Acts second.'],
    ] as const) {
      const result = render(PlayerSide, { props: { localiser, ...KNIGHT, position } });
      const name = result.container.querySelector('[role="group"]')?.getAttribute('aria-label');
      expect(name).toBe(
        `You: ${planText(localiser, { character: 'knight', targets: [...KNIGHT.targets!] })}. Initiative 4. ${said}`,
      );
      result.unmount();
    }
    const { side } = renderSide(KNIGHT);
    expect(side.getAttribute('aria-label'), 'unsaid without a position').not.toMatch(/Acts/);
  });

  it('the character name is not repeated beside the card', () => {
    const { side } = renderSide(KNIGHT);
    const card = side.querySelector('.card')!;
    expect(card, 'the card is drawn').not.toBeNull();
    const beside = Array.from(side.querySelectorAll<HTMLElement>('[data-part^="side-"]'))
      .filter((element) => !card.contains(element))
      .map((element) => element.textContent ?? '')
      .join(' ');
    expect(beside).not.toContain('Knight');
    expect(screen.getByRole('button', { name: /Knight/ })).toBeTruthy();
  });
});
