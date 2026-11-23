import { render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocaliser } from '@wwd/client-core';
import Table from '../../src/screens/Table.svelte';
import { setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';
import { newGame, stateFor } from '../games.js';

const localiser = createLocaliser('en');
afterEach(() => setDisplaySettings(DEFAULT_SETTINGS));

describe('PhaseBar', () => {
  it('adds a rules hint under the instruction only while rules hints are on', () => {
    const state = stateFor(newGame(12), 'p1');
    const { unmount } = render(Table, { props: { localiser, state, onCommand: () => {} } });
    expect(screen.getByTestId('phase-hint').textContent).toBe(localiser.t('hint-plan'));
    unmount();

    setDisplaySettings({ ...DEFAULT_SETTINGS, rulesHints: false });
    render(Table, { props: { localiser, state, onCommand: () => {} } });
    expect(screen.queryByTestId('phase-hint')).toBeNull();
  });
});
