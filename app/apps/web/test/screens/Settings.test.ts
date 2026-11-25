import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TargetCard } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import { resetDeviceStore, setDeviceStore } from '../../src/device-store.js';
import { CHARACTERS } from '../../src/cards.js';
import About from '../../src/screens/About.svelte';
import CharacterReference from '../../src/screens/CharacterReference.svelte';
import Settings from '../../src/screens/Settings.svelte';
import { setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';
import { openDeviceStore, type DeviceStore } from '../../src/storage/db.js';
import { abilityText, cardName } from '../../src/text.js';

const localiser = createLocaliser('en');
let store: DeviceStore;

beforeEach(async () => {
  store = await openDeviceStore();
  setDeviceStore(store);
});

afterEach(() => {
  resetDeviceStore();
  setDisplaySettings(DEFAULT_SETTINGS);
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  root.removeAttribute('data-contrast');
  root.style.removeProperty('--text-scale');
  location.hash = '';
});

describe('Settings', () => {
  it('changing theme applies at once and persists', async () => {
    const user = userEvent.setup();
    render(Settings, { props: { localiser } });
    await user.click(await screen.findByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await waitFor(async () => expect((await store.settings.get()).theme).toBe('dark'));
  });

  it('saving a change keeps fields changed elsewhere', async () => {
    const user = userEvent.setup();
    render(Settings, { props: { localiser } });
    await user.click(await screen.findByRole('radio', { name: 'Dark' }));
    await store.settings.put({ ...(await store.settings.get()), installCardDismissed: true });
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    await waitFor(async () => expect((await store.settings.get()).theme).toBe('light'));
    expect((await store.settings.get()).installCardDismissed).toBe(true);
  });

  it('two quick changes both persist', async () => {
    render(Settings, { props: { localiser } });
    const contrast = await screen.findByRole('switch', { name: /High contrast/ });
    const patterns = screen.getByRole('switch', { name: /Colour-blind patterns/ });
    await fireEvent.click(contrast);
    await fireEvent.click(patterns);
    await waitFor(async () => {
      const stored = await store.settings.get();
      expect([stored.highContrast, stored.colourBlindPatterns]).toEqual([true, true]);
    });
  });

  it('card text changes are shared with the cards and persist', async () => {
    const user = userEvent.setup();
    render(Settings, { props: { localiser } });
    await user.click(await screen.findByRole('radio', { name: 'Text only' }));
    await waitFor(async () => expect((await store.settings.get()).cardText).toBe('text-only'));
  });

  it('toggles show their state in words', async () => {
    const user = userEvent.setup();
    render(Settings, { props: { localiser } });
    const toggle = await screen.findByRole('switch', { name: /High contrast/ });
    expect(toggle.textContent).toContain('OFF');
    await user.click(toggle);
    expect(toggle.textContent).toContain('ON');
    expect(document.documentElement.getAttribute('data-contrast')).toBe('high');
    await waitFor(async () => expect((await store.settings.get()).highContrast).toBe(true));
  });

  it('text size offers the four mockup presets', async () => {
    const user = userEvent.setup();
    render(Settings, { props: { localiser } });
    const group = await screen.findByRole('radiogroup', { name: 'Text size' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => radio.closest('label')?.textContent?.trim())).toEqual([
      '90%',
      '100%',
      '125%',
      '150%',
    ]);
    expect(within(group).getByRole('radio', { name: '100%' })).toHaveProperty('checked', true);
    expect(screen.queryByRole('slider')).toBeNull();
    await user.click(within(group).getByRole('radio', { name: '125%' }));
    await waitFor(async () => expect((await store.settings.get()).textSize).toBe(125));
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.25');
    await user.click(within(group).getByRole('radio', { name: '90%' }));
    await waitFor(async () => expect((await store.settings.get()).textSize).toBe(90));
  });

  it('a stored text size between presets shows the nearest preset', async () => {
    await store.settings.put({ ...DEFAULT_SETTINGS, textSize: 120 });
    render(Settings, { props: { localiser } });
    const group = await screen.findByRole('radiogroup', { name: 'Text size' });
    expect(within(group).getByRole('radio', { name: '125%' })).toHaveProperty('checked', true);
  });

  it('data actions are danger buttons with the warning icon', async () => {
    render(Settings, { props: { localiser } });
    for (const name of ['Export', 'Import']) {
      const button = await screen.findByRole('button', { name });
      expect(button.classList.contains('small'), name).toBe(true);
      expect(button.classList.contains('danger'), name).toBe(false);
    }
    for (const name of ['Clear history', 'Delete all data']) {
      const button = screen.getByRole('button', { name });
      expect(button.classList.contains('small'), name).toBe(true);
      expect(button.classList.contains('danger'), name).toBe(true);
      expect(button.querySelector('svg.warning-icon[aria-hidden="true"]'), name).not.toBeNull();
    }
  });

  it('custom server must be https', async () => {
    const user = userEvent.setup();
    render(Settings, { props: { localiser } });
    const server = await screen.findByRole('combobox', { name: 'Server' });
    expect(Array.from(server.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'Default',
      'Custom…',
    ]);
    expect(screen.queryByLabelText('Server address')).toBeNull();
    await user.selectOptions(server, 'custom');
    const input = screen.getByLabelText('Server address');
    await user.type(input, 'http://example.com');
    await user.click(screen.getByRole('button', { name: 'Use this server' }));
    expect(screen.getByRole('alert').textContent).toContain('https://');
    expect((await store.settings.get()).server).toBeNull();

    await user.clear(input);
    await user.type(input, 'https://game.example.com/');
    await user.click(screen.getByRole('button', { name: 'Use this server' }));
    await waitFor(async () =>
      expect((await store.settings.get()).server).toBe('https://game.example.com'),
    );
    expect(screen.queryByRole('alert')).toBeNull();

    await user.selectOptions(server, 'default');
    await waitFor(async () => expect((await store.settings.get()).server).toBeNull());
    expect(screen.queryByLabelText('Server address')).toBeNull();
  });

  it('display name edits the identity', async () => {
    const user = userEvent.setup();
    render(Settings, { props: { localiser } });
    const input = await screen.findByLabelText('Display name');
    await user.type(input, '  Mika  ');
    await user.tab();
    await waitFor(async () => expect((await store.identity.get()).displayName).toBe('Mika'));
  });

  it('language lists system and English', async () => {
    render(Settings, { props: { localiser } });
    const select = await screen.findByRole('combobox', { name: 'Language' });
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'System (English)',
      'English',
    ]);
  });

  it('has one h1 and a back button', async () => {
    render(Settings, { props: { localiser } });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });
});

describe('About', () => {
  it('about shows the unofficial notice and credits', () => {
    render(About, { props: { localiser } });
    expect(screen.getByText(localiser.t('footer-unofficial'))).toBeTruthy();
    expect(screen.getByText('© 2026 David F Dev')).toBeTruthy();
    expect(screen.getByText(/Version \d/)).toBeTruthy();
    for (const name of [
      'Lexend',
      'OpenDyslexic',
      'Marcellus',
      'Atkinson Hyperlegible Next',
      'idb',
    ]) {
      expect(screen.getByText(new RegExp(`^${name},`))).toBeTruthy();
    }
    expect(
      screen.getByText(/^The fonts are used under the SIL Open Font License 1.1/),
    ).toBeTruthy();
    expect(screen.getByText(/MIT OR Apache-2.0/)).toBeTruthy();
    expect(screen.getByText(/Placeholder shapes/)).toBeTruthy();
  });
});

describe('Character reference', () => {
  it('lists all eight characters and the Fool with their abilities', () => {
    render(CharacterReference, { props: { localiser } });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const list = screen.getByTestId('reference-characters');
    expect(within(list).getAllByRole('listitem')).toHaveLength(9);
    const names = Array.from(list.querySelectorAll('[data-part="reference-name"]'));
    expect(names.map((name) => name.textContent)).toContain('Knight, initiative 3, Human');
    expect(names.at(-1)?.textContent).toBe('The Fool');
  });

  it('each how to play row exposes the ability exactly once in the accessibility tree', () => {
    render(CharacterReference, { props: { localiser } });
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
});

describe('Ability legend', () => {
  it('how to play shows the ability legend first', () => {
    render(CharacterReference, { props: { localiser } });
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
