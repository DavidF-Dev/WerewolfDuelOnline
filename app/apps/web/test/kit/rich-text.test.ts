import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { richMessage, type MessageArgs, type Translator } from '@wwd/client-core';
import RichText from '../../src/kit/RichText.svelte';

/** A translator with one message, `hit`, that names a player, two characters and a marker. */
const tr: Translator = {
  t: (id: string, args: MessageArgs = {}) =>
    id === 'hit'
      ? `${args['actorName']} hits ${args['victim']} with the ${args['attacker']}: -1 ${args['marker']}.`
      : id,
};

describe('RichText', () => {
  it('rich text bolds names and puts icons before markers', () => {
    const args = { actorName: 'Mika', attacker: 'Knight', victim: 'Wolfen', marker: 'Health' };
    const parts = richMessage(tr, 'hit', args, {
      actorName: 'player',
      attacker: 'character',
      victim: 'character',
      marker: { marker: 'health' },
    });
    const { container } = render(RichText, { props: { parts } });
    const text = container.querySelector('[data-part="rich-text"]');

    expect(Array.from(text?.querySelectorAll('strong') ?? []).map((b) => b.textContent)).toEqual([
      'Mika',
      'Wolfen',
      'Knight',
    ]);
    const marker = text?.querySelector('[data-part="marker"]');
    expect(marker?.textContent).toBe('Health');
    const icon = marker?.querySelector('[data-part="icon"]');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(marker?.firstElementChild).toBe(icon);
    expect(text?.textContent).toBe(tr.t('hit', args));
    expect(text?.getAttribute('aria-label')).toBeNull();
  });
});
