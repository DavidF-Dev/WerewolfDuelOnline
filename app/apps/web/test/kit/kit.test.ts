import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { createRawSnippet, tick } from 'svelte';
import { createLocaliser } from '@wwd/client-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Button from '../../src/components/Button.svelte';
import ConfirmDialog from '../../src/components/ConfirmDialog.svelte';
import Screen from '../../src/components/Screen.svelte';
import Scenery from '../../src/kit/Scenery.svelte';
import Segmented from '../../src/kit/Segmented.svelte';
import Select from '../../src/kit/Select.svelte';
import Sheet from '../../src/kit/Sheet.svelte';
import Stepper from '../../src/kit/Stepper.svelte';
import Switch from '../../src/kit/Switch.svelte';
import UnofficialNotice from '../../src/components/UnofficialNotice.svelte';
import { setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';

const html = (markup: string) => createRawSnippet(() => ({ render: () => markup }));

afterEach(() => {
  setDisplaySettings(DEFAULT_SETTINGS);
});

describe('kit', () => {
  it('kit controls keep their roles', async () => {
    const user = userEvent.setup();
    const chosen = vi.fn();
    render(Segmented, {
      props: {
        label: 'Theme',
        value: 'light',
        options: [
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ],
        onchange: chosen,
      },
    });
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => (radio as HTMLInputElement).type)).toEqual([
      'radio',
      'radio',
      'radio',
    ]);
    expect(new Set(radios.map((radio) => (radio as HTMLInputElement).name)).size).toBe(1);
    expect(within(group).getByRole('radio', { name: 'Light' })).toHaveProperty('checked', true);
    await user.click(within(group).getByRole('radio', { name: 'Dark' }));
    expect(chosen).toHaveBeenCalledWith('dark');

    const toggled = vi.fn();
    const toggle = render(Switch, {
      props: {
        label: 'High contrast',
        checked: false,
        onText: 'ON',
        offText: 'OFF',
        onchange: toggled,
      },
    });
    const control = screen.getByRole('switch', { name: 'High contrast' });
    expect(control.tagName).toBe('BUTTON');
    expect(control.getAttribute('aria-checked')).toBe('false');
    expect(control.textContent).toContain('OFF');
    await user.click(control);
    expect(toggled).toHaveBeenCalledWith(true);
    await toggle.rerender({ checked: true });
    expect(control.getAttribute('aria-checked')).toBe('true');
    expect(control.textContent).toContain('ON');

    render(Select, {
      props: {
        'aria-label': 'Language',
        value: 'en',
        children: html('<option value="en">English</option>'),
      },
    });
    expect(screen.getByRole('combobox', { name: 'Language' }).tagName).toBe('SELECT');

    const stepped = vi.fn();
    render(Stepper, {
      props: {
        label: 'Hourglasses',
        decreaseLabel: 'Fewer',
        increaseLabel: 'More',
        value: 0,
        min: 0,
        max: 2,
        onchange: stepped,
      },
    });
    const stepper = screen.getByRole('group', { name: 'Hourglasses' });
    expect(
      within(stepper).getByRole('button', { name: 'Fewer' }).getAttribute('aria-disabled'),
    ).toBe('true');
    await user.click(within(stepper).getByRole('button', { name: 'More' }));
    expect(stepped).toHaveBeenCalledWith(1);
  });

  it('danger buttons carry the warning icon', () => {
    for (const variant of ['danger', 'danger-solid'] as const) {
      const { unmount } = render(Button, {
        props: { variant, children: html('<span>Delete</span>') },
      });
      const button = screen.getByRole('button', { name: 'Delete' });
      const icon = button.querySelector('svg.warning-icon');
      expect(icon, variant).not.toBeNull();
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
      unmount();
    }
    render(Button, { props: { variant: 'primary', children: html('<span>Go</span>') } });
    expect(screen.getByRole('button', { name: 'Go' }).querySelector('svg.warning-icon')).toBeNull();

    render(ConfirmDialog, {
      props: {
        title: 'Delete all data?',
        confirmLabel: 'Delete all data',
        cancelLabel: 'Cancel',
        danger: true,
        onConfirm: () => undefined,
        onCancel: () => undefined,
      },
    });
    expect(screen.getByTestId('confirm-yes').querySelector('svg.warning-icon')).not.toBeNull();
    expect(screen.getByTestId('confirm-no').querySelector('svg.warning-icon')).toBeNull();
  });

  it('scenery is decorative', () => {
    render(Screen, {
      props: { title: 'Settings', testId: 'settings', children: html('<p>Body</p>') },
    });
    const scenery = screen.getByTestId('settings').querySelector('[data-part="scenery"]');
    expect(scenery).not.toBeNull();
    expect(scenery?.getAttribute('aria-hidden')).toBe('true');
    expect(scenery?.textContent).toBe('');
    expect(scenery?.getAttribute('role')).toBeNull();
    expect(scenery?.getAttribute('tabindex')).toBeNull();

    const { container } = render(Scenery);
    expect(container.querySelector('[data-part="scenery"]')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('fit screens never scroll at 100% text', async () => {
    const { rerender } = render(Screen, {
      props: {
        title: 'Round 3',
        testId: 'table',
        fit: true,
        footer: html('<div data-testid="phase">Seal your plan</div>'),
        children: html('<p>Middle</p>'),
      },
    });
    const body = screen.getByTestId('table');
    const frame = body.closest('[data-part="screen"]');
    expect(frame?.getAttribute('data-fit')).toBe('true');
    expect(body.contains(screen.getByTestId('phase'))).toBe(false);
    expect(frame?.contains(screen.getByTestId('phase'))).toBe(true);
    await rerender({ fit: false });
    expect(frame?.getAttribute('data-fit')).toBeNull();
  });

  it('the unofficial notice moves into fit screens', async () => {
    const localiser = createLocaliser('en');
    const notice = localiser.t('footer-unofficial');
    render(UnofficialNotice, { props: { localiser, placement: 'page' } });
    expect(screen.getByText(notice)).toBeTruthy();

    const game = render(Screen, {
      props: { title: 'Round 3', testId: 'table', fit: true, children: html('<p>Middle</p>') },
    });
    await tick();
    expect(screen.queryByText(notice)).toBeNull();
    render(UnofficialNotice, { props: { localiser, placement: 'inline' } });
    expect(screen.getAllByText(notice)).toHaveLength(1);

    game.unmount();
    await tick();
    expect(screen.getAllByText(notice)).toHaveLength(2);
  });

  it('focus stays in the stepper at its limits', async () => {
    const user = userEvent.setup();
    const onchange = vi.fn();
    const { rerender } = render(Stepper, {
      props: {
        label: 'Hourglasses',
        decreaseLabel: 'Fewer',
        increaseLabel: 'More',
        value: 1,
        min: 0,
        max: 2,
        onchange,
      },
    });
    const more = screen.getByRole('button', { name: 'More' });
    await user.click(more);
    expect(onchange).toHaveBeenLastCalledWith(2);
    await rerender({ value: 2 });
    expect(more.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(more);
    await user.click(more);
    expect(onchange).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(more);
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fewer' }));
  });

  it('sheets are modal, close on Escape and give focus back', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const onclose = vi.fn();
    const { unmount } = render(Sheet, {
      props: { title: 'Game menu', closeLabel: 'Close', onclose, children: html('<p>Menu</p>') },
    });
    const sheet = screen.getByRole('dialog', { name: 'Game menu' }) as HTMLDialogElement;
    expect(sheet.open).toBe(true);
    expect(sheet.contains(document.activeElement)).toBe(true);
    await fireEvent(sheet, new Event('cancel', { cancelable: true }));
    expect(onclose).toHaveBeenCalledOnce();
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
