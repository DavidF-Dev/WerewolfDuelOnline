import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import TargetCard from '../../src/components/TargetCard.svelte';

const localiser = createLocaliser('en');

describe('TargetCard', () => {
  it('names a character target like its character card', () => {
    render(TargetCard, { props: { localiser, card: { character: 'wolf_king' } } });
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      `2, Wolf King, Werewolf. ${localiser.t('card-ability-wolf-king')}`,
    );
  });

  it('names the Fool with its ability', () => {
    const { container } = render(TargetCard, { props: { localiser, card: 'fool' } });
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe(
      `The Fool. ${localiser.t('card-ability-fool')}`,
    );
    expect(container.querySelector('[data-part="initiative"]')).toBeNull();
  });

  it('the Fool has a silhouette of its own', () => {
    const fool = render(TargetCard, { props: { localiser, card: 'fool' } });
    const knight = render(TargetCard, { props: { localiser, card: { character: 'knight' } } });
    const wolfen = render(TargetCard, { props: { localiser, card: { character: 'wolfen' } } });
    const d = (c: HTMLElement) => c.querySelector('[data-part="silhouette"]')?.getAttribute('d');
    expect(new Set([d(fool.container), d(knight.container), d(wolfen.container)]).size).toBe(3);
  });

  it('the Fool ability text is written', () => {
    expect(localiser.t('card-ability-fool')).toMatch(/^\p{Lu}.*\.$/u);
  });
});
