import { getContext, setContext } from 'svelte';
import { display, type DisplaySettings } from '../settings/display.svelte.js';

/** The settings that change how a table plays, as one table plays by them. */
export type TableSettings = Pick<DisplaySettings, 'showdownSpeed' | 'confirmPlan' | 'rulesHints'>;

const KEY = Symbol('table-settings');

/**
 * Gives the components inside this one the table's settings: the player's own, or while `coached`
 * holds a fixed set that steps the showdown, seals without asking and shows no rules hints.
 */
export function provideTableSettings(coached: () => boolean): TableSettings {
  return setContext<TableSettings>(KEY, {
    get showdownSpeed() {
      return coached() ? 'step' : display.showdownSpeed;
    },
    get confirmPlan() {
      return coached() ? false : display.confirmPlan;
    },
    get rulesHints() {
      return coached() ? false : display.rulesHints;
    },
  });
}

/** The settings of the table this component is part of, or the player's own outside a table. */
export const tableSettings = (): TableSettings => getContext<TableSettings>(KEY) ?? display;
