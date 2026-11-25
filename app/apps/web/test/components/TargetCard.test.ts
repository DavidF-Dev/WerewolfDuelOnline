import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import TargetCard from '../../src/components/TargetCard.svelte';
import { abilityText } from '../../src/text.js';

const localiser = createLocaliser('en');

describe('TargetCard', () => {
  it('names a character target like its character card', () => {
    render(TargetCard, { props: { localiser, card: { character: 'wolf_king' } } });
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      '2, Wolf King, Werewolf. Attack any number of Humans. Each Human after the first costs a Fang, or there is no attack.',
    );
  });

  it('names the Fool with its ability', () => {
    const { container } = render(TargetCard, { props: { localiser, card: 'fool' } });
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      'The Fool. No effect. Add it to any plan to bluff.',
    );
    expect(container.querySelector('[data-part="initiative"]')?.textContent).toBe('–');
  });

  it('the Fool has no faction icon and a neutral art panel', () => {
    const { container } = render(TargetCard, { props: { localiser, card: 'fool' } });
    expect(container.querySelector('[data-part="faction"]')).toBeNull();
    expect(container.querySelector('.face')?.classList.contains('neutral')).toBe(true);
  });

  it('the Fool ability text is written', () => {
    expect(abilityText(localiser, 'fool')).toMatch(/^\p{Lu}[^{}]*\.$/u);
  });
});
