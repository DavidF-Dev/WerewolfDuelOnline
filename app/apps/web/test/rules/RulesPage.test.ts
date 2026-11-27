import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TargetCard } from '@wwd/engine';
import { createLocaliser, loadLocale } from '@wwd/client-core';
import { CHARACTERS } from '../../src/cards.js';
import { resetDeviceStore, setDeviceStore } from '../../src/device-store.js';
import RulesPage from '../../src/rules/RulesPage.svelte';
import { RULES_SECTIONS, type RulesSection } from '../../src/rules/sections.js';
import HowToPlay from '../../src/screens/HowToPlay.svelte';
import Rules from '../../src/screens/Rules.svelte';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';
import { openDeviceStore } from '../../src/storage/db.js';
import { abilityText, cardName } from '../../src/text.js';

const localiser = createLocaliser('en');

const page = (section: RulesSection, onNavigate = vi.fn()) =>
  render(RulesPage, { props: { localiser, section, onNavigate } });

afterEach(() => {
  location.hash = '';
  resetDeviceStore();
});

describe('RulesPage', () => {
  it('each section renders its heading and where it is in the rules', () => {
    for (const [i, section] of RULES_SECTIONS.entries()) {
      const { unmount } = page(section);
      expect(
        screen.getByRole('heading', { level: 2, name: localiser.t(`rules-${section}-title`) }),
      ).toBeTruthy();
      expect(screen.getByTestId('rules-progress').textContent).toBe(`Rules · ${i + 1} of 6`);
      unmount();
    }
  });

  it('Previous is absent on the first section and Next on the last', () => {
    const first = page('goal');
    expect(screen.queryByTestId('rules-previous')).toBeNull();
    expect(screen.getByTestId('rules-next').textContent).toContain('Setting up');
    first.unmount();
    page('fine-points');
    expect(screen.getByTestId('rules-previous').textContent).toContain('Characters');
    expect(screen.queryByTestId('rules-next')).toBeNull();
  });

  it('Previous and Next ask for the neighbouring sections', async () => {
    const onNavigate = vi.fn();
    page('round', onNavigate);
    await userEvent.click(screen.getByTestId('rules-next'));
    await userEvent.click(screen.getByTestId('rules-previous'));
    expect(onNavigate.mock.calls).toEqual([['markers'], ['setup']]);
  });

  it('every paragraph is written out, with no message id showing', () => {
    for (const section of RULES_SECTIONS) {
      const { container, unmount } = page(section);
      const text = container.textContent ?? '';
      expect(text, section).not.toMatch(/rules-|how-to-play-|[{}]/);
      unmount();
    }
  });

  it('names characters in bold and draws a token before each marker word', () => {
    page('fine-points');
    const bold = Array.from(document.querySelectorAll('strong')).map((s) => s.textContent);
    expect(bold).toContain('Wolf King');
    const markers = Array.from(document.querySelectorAll('[data-part="marker"]'));
    expect(markers.map((m) => m.textContent)).toContain('Fang');
    for (const marker of markers) {
      expect(marker.querySelector('[aria-hidden="true"]'), marker.textContent ?? '').not.toBeNull();
    }
  });

  it('"A round" is five numbered steps', () => {
    page('round');
    const steps = within(screen.getByTestId('rules-steps')).getAllByRole('listitem');
    expect(steps).toHaveLength(5);
    expect(screen.getByTestId('rules-steps').tagName).toBe('OL');
  });

  it('"Characters" renders every character and the Fool, with how to read abilities', () => {
    page('characters');
    expect(screen.getByTestId('ability-legend')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'How to read abilities' })).toBeTruthy();
    const list = screen.getByTestId('reference-characters');
    expect(within(list).getAllByRole('listitem')).toHaveLength(9);
  });
});

describe('Rules screen', () => {
  it('names its section in the bar, once, with its back button and the page for its section', () => {
    render(Rules, { props: { localiser, section: 'markers' } });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Markers');
    expect(screen.queryAllByRole('heading', { level: 2, name: 'Markers' })).toHaveLength(0);
    expect(screen.getByTestId('rules-progress').textContent).toBe('Rules · 4 of 6');
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.getByTestId('rules-page').dataset['section']).toBe('markers');
  });

  it('Next opens the next section by its address, and Back goes to How to play', async () => {
    render(Rules, { props: { localiser, section: 'goal' } });
    await userEvent.click(screen.getByTestId('rules-next'));
    expect(location.hash).toBe('#/rules/setup');
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(location.hash).toBe('#/how-to-play');
  });
});

/** Where a heading level is skipped, going down from `start`, among the headings in `root`. */
function skippedLevels(root: ParentNode, start: number): string[] {
  let previous = start;
  const skips: string[] = [];
  for (const heading of Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'))) {
    const level = Number(heading.tagName.slice(1));
    if (level > previous + 1) skips.push(`h${previous} → h${level}: ${heading.textContent}`);
    previous = level;
  }
  return skips;
}

describe('heading levels', () => {
  it('no section skips a level, on its own screen or in the sheet', async () => {
    for (const section of RULES_SECTIONS) {
      const route = render(Rules, { props: { localiser, section } });
      expect(skippedLevels(document.body, 0), `${section} on its screen`).toEqual([]);
      route.unmount();
      const sheet = render(RulesPage, { props: { localiser, section, onNavigate: vi.fn() } });
      expect(skippedLevels(sheet.container, 2), `${section} under a heading of level 2`).toEqual(
        [],
      );
      sheet.unmount();
    }
  });

  it('the Characters page heads the ability legend one level below the page', () => {
    render(Rules, { props: { localiser, section: 'characters' } });
    expect(
      within(screen.getByTestId('ability-legend')).getByRole('heading', { level: 2 }).textContent,
    ).toBe('How to read abilities');
  });
});

describe('How to play', () => {
  it('offers the tutorial, then lists the six sections with links to each', () => {
    render(HowToPlay, { props: { localiser } });
    const tutorial = screen.getByTestId('how-to-play-tutorial');
    expect(within(tutorial).getByRole('link').getAttribute('href')).toBe('#/tutorial');
    const rows = within(screen.getByTestId('rules-sections')).getAllByRole('link');
    expect(rows.map((row) => row.getAttribute('href'))).toEqual(
      RULES_SECTIONS.map((section) => `#/rules/${section}`),
    );
    expect(rows[0]?.textContent).toContain('The goal');
    expect(rows[0]?.textContent).toContain('1');
    expect(
      tutorial.compareDocumentPosition(screen.getByTestId('rules-sections')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      'the tutorial comes first',
    ).toBeTruthy();
  });

  it('offers the round against the opponent by name', () => {
    render(HowToPlay, { props: { localiser } });
    const tutorial = screen.getByTestId('how-to-play-tutorial');
    expect(within(tutorial).getByRole('heading').textContent).toBe('New to the game?');
    expect(tutorial.textContent).toContain('Play one guided round against Alicia.');
    expect(within(tutorial).getByRole('link').textContent).toBe('Start the tutorial');
  });

  it('reads Tutorial finished, with Play it again, once the tutorial is finished', async () => {
    const store = await openDeviceStore();
    await store.settings.put({ ...DEFAULT_SETTINGS, tutorialFinished: true });
    setDeviceStore(store);
    render(HowToPlay, { props: { localiser } });
    const tutorial = screen.getByTestId('how-to-play-tutorial');
    await waitFor(() =>
      expect(within(tutorial).getByRole('heading').textContent).toBe('Tutorial finished'),
    );
    const again = within(tutorial).getByRole('link');
    expect(again.textContent).toBe('Play it again');
    expect(again.getAttribute('href')).toBe('#/tutorial');
    expect(again.classList.contains('primary')).toBe(false);
  });
});

describe('Character reference', () => {
  const characters = () => render(Rules, { props: { localiser, section: 'characters' } });

  it('lists all eight characters and the Fool with their abilities', () => {
    characters();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const list = screen.getByTestId('reference-characters');
    expect(within(list).getAllByRole('listitem')).toHaveLength(9);
    const names = Array.from(list.querySelectorAll('[data-part="reference-name"]'));
    expect(names.map((name) => name.textContent)).toContain('Knight, initiative 3, Human');
    expect(names.at(-1)?.textContent).toBe('The Fool');
  });

  it('in another language, each character shows its English printed name in English', async () => {
    await loadLocale('de');
    const german = createLocaliser('de');
    render(Rules, { props: { localiser: german, section: 'characters' } });
    const printed = Array.from(
      screen.getByTestId('reference-characters').querySelectorAll('[data-part="printed-name"]'),
    );
    expect(printed.map((line) => line.querySelector('[lang="en"]')?.textContent)).toEqual([
      'Hunter',
      'Wolf King',
      'Knight',
      'Wolfen',
      'Seer',
      'Witch',
      'Wolf Beauty',
      'Villager',
      'The Fool',
    ]);
    expect(printed[2]?.textContent).toBe(german.t('reference-printed-name', { name: 'Knight' }));
  });

  it('in English, no character repeats its name as the printed one', () => {
    characters();
    expect(document.querySelectorAll('[data-part="printed-name"]')).toHaveLength(0);
  });

  it('each row exposes the ability exactly once in the accessibility tree', () => {
    characters();
    // The text a screen reader reaches: labels and text, skipping aria-hidden subtrees.
    const exposed = (element: Element): string => {
      if (element.getAttribute('aria-hidden') === 'true') return '';
      const label = element.getAttribute('aria-label');
      if (label !== null) return label;
      return Array.from(element.childNodes)
        .map((node) =>
          node instanceof Element
            ? exposed(node)
            : node.nodeType === Node.TEXT_NODE
              ? (node.textContent ?? '')
              : '',
        )
        .join('');
    };
    const rows = within(screen.getByTestId('reference-characters')).getAllByRole('listitem');
    const cards: TargetCard[] = [...CHARACTERS.map((character) => ({ character })), 'fool'];
    expect(rows).toHaveLength(cards.length);
    rows.forEach((row, i) => {
      const card = cards[i]!;
      const ability = abilityText(localiser, card);
      const text = exposed(row).replace(/\s+/g, ' ').trim();
      expect(text.split(ability).length - 1, ability).toBe(1);
      expect(row.querySelectorAll('button, a[href], [tabindex]'), 'no control').toHaveLength(0);
      const name = card === 'fool' ? 'The Fool' : cardName(localiser, card.character);
      expect(text.startsWith(name), `${name} is named first`).toBe(true);
    });
  });

  it('shows the ability legend first', () => {
    characters();
    const legend = screen.getByTestId('ability-legend');
    const list = screen.getByTestId('reference-characters');
    expect(
      legend.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the legend comes first',
    ).toBeTruthy();
    const beside = (row: HTMLElement) =>
      Array.from(row.querySelectorAll('[data-part="reference-ability"] [data-part="rich-text"]'));
    const rows = within(list).getAllByRole('listitem');
    for (const row of rows) {
      expect(row.querySelector('[data-part="face"]')?.classList.contains('medium')).toBe(true);
      expect(beside(row), 'one ability statement beside the card').toHaveLength(1);
    }
    const ability = beside(rows[CHARACTERS.indexOf('knight')]!)[0]!;
    expect(ability.textContent).toBe(abilityText(localiser, { character: 'knight' }));
    expect(ability.querySelector('[data-part="icon"]')).not.toBeNull();
  });
});
