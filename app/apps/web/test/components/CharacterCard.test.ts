import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import CharacterCard from '../../src/components/CharacterCard.svelte';
import { CHARACTERS } from '../../src/cards.js';
import { setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';
import { abilityText } from '../../src/text.js';

const localiser = createLocaliser('en');

afterEach(() => setDisplaySettings(DEFAULT_SETTINGS));

function renderCard(character: Character, props: Record<string, unknown> = {}) {
  return render(CharacterCard, { props: { localiser, character, ...props } });
}

describe('CharacterCard', () => {
  it('card accessible name includes initiative, faction and ability', () => {
    renderCard('knight');
    const card = screen.getByRole('button');
    expect(card.getAttribute('aria-label')).toBe(
      '3, Knight, Human. Gain an Hourglass, then attack a Werewolf.',
    );
    expect(screen.getByRole('button', { name: /^3, Knight, Human[.] / })).toBe(card);
  });

  it('every character has its own ability text', () => {
    const abilities = CHARACTERS.map((character) => abilityText(localiser, { character }));
    for (const text of abilities) expect(text).toMatch(/^\p{Lu}[^{}]*\.$/u);
    expect(new Set(abilities).size).toBe(CHARACTERS.length);
  });

  it('shows the given initiative in place of the printed one', () => {
    renderCard('knight', { initiative: 1 });
    expect(screen.getByRole('button', { name: /^1, Knight, Human[.] / })).toBeTruthy();
    expect(screen.getByText('1', { selector: '[data-part="initiative"]' })).toBeTruthy();
  });

  it('disabled card exposes its reason', async () => {
    const onselect = vi.fn();
    renderCard('seer', { state: 'disabled', reason: 'Not in this plan.', onselect });
    const card = screen.getByRole('button');
    expect(card.getAttribute('aria-disabled')).toBe('true');
    const described = card.getAttribute('aria-describedby');
    expect(described).not.toBeNull();
    expect(document.getElementById(described!)?.textContent).toBe('Not in this plan.');
    await userEvent.setup().click(card);
    expect(onselect).not.toHaveBeenCalled();
  });

  it('a selectable card reports its pressed state and its selection', async () => {
    const onselect = vi.fn();
    renderCard('hunter', { state: 'selected', onselect });
    const card = screen.getByRole('button', { pressed: true });
    await userEvent.setup().click(card);
    expect(onselect).toHaveBeenCalledOnce();
  });

  it('shows a glyph and the name by default', () => {
    const { container } = renderCard('witch');
    expect(container.querySelector('[data-part="glyph"]')).not.toBeNull();
    expect(screen.getByText('Witch')).toBeTruthy();
  });

  it('text-only card text shows the name and the ability text', () => {
    setDisplaySettings({ ...DEFAULT_SETTINGS, cardText: 'text-only' });
    const { container } = renderCard('witch');
    expect(container.querySelector('[data-part="glyph"]')).toBeNull();
    expect(screen.getByText('Witch')).toBeTruthy();
    expect(container.querySelector('[data-part="text"]')?.textContent).toContain('Potion');
  });

  it('colour-blind patterns strengthen the Werewolf hatching', () => {
    const plain = renderCard('wolfen');
    expect(plain.container.querySelector('.face')?.classList.contains('strong')).toBe(false);
    plain.unmount();
    setDisplaySettings({ ...DEFAULT_SETTINGS, colourBlindPatterns: true });
    const strong = renderCard('wolfen');
    expect(strong.container.querySelector('.face')?.classList.contains('strong')).toBe(true);
  });
});
