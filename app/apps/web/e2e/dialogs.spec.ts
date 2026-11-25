import { expect, test, type Page } from '@playwright/test';

async function openEntry(page: Page, id: string): Promise<void> {
  await page.goto(`/#/dev/gallery/${id}`);
  await expect(page.locator('html')).toHaveAttribute('data-gallery-ready', id);
}

/**
 * Each dialog's entry and its answers in order, by test id or, without one, by name. The last is
 * the safe way out; `danger` marks a destructive dialog.
 */
const DIALOGS: Readonly<Record<string, { answers: string[]; danger?: true }>> = {
  'delete-all': {
    answers: ['Export backup first', 'confirm-yes', 'confirm-no'],
    danger: true,
  },
  'clear-history': {
    answers: ['Export backup first', 'confirm-yes', 'confirm-no'],
    danger: true,
  },
  'table-resign': { answers: ['confirm-yes', 'confirm-no'], danger: true },
  'backup-export': { answers: ['confirm-yes', 'confirm-no'] },
  'backup-import': { answers: ['confirm-yes', 'confirm-no'] },
  'display-name': { answers: ['name-continue', 'name-skip'] },
  'server-confirm': { answers: ['server-continue', 'server-cancel'] },
  'table-plan-seal': { answers: ['confirm-yes', 'confirm-no'] },
  'table-rejoin-request': { answers: ['confirm-yes', 'confirm-no'] },
};

/** The topmost open dialog that is not a sheet: its box, its padding, its title and its answers. */
const measureDialog = (page: Page) =>
  page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]'));
    const dialog = dialogs
      .filter((d) => d.querySelector('[data-part="sheet-body"]') === null)
      .pop();
    if (dialog === undefined) return null;
    const style = getComputedStyle(dialog);
    const box = dialog.getBoundingClientRect();
    const title = dialog.querySelector('h2');
    const shown = (element: Element) => element.getBoundingClientRect().height > 0;
    const answers = Array.from(dialog.querySelectorAll<HTMLElement>('button, a[href]'))
      .filter(shown)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          key: element.dataset['testid'] ?? element.textContent?.trim() ?? '',
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      });
    return {
      left: box.left + parseFloat(style.paddingLeft),
      right: box.right - parseFloat(style.paddingRight),
      bottom: box.bottom - parseFloat(style.paddingBottom),
      scrolls: dialog.scrollHeight > dialog.clientHeight,
      titleIcon: title?.firstElementChild?.matches('svg.warning-icon[aria-hidden="true"]') ?? false,
      titleIcons: title?.querySelectorAll('svg').length ?? 0,
      titleName: title?.textContent?.trim() ?? '',
      // The last shown element of the dialog's content, which must be the final answer.
      last: Array.from(dialog.querySelectorAll<HTMLElement>('*'))
        .filter((element) => shown(element) && element.children.length === 0)
        .map((element) => element.closest('button, a[href]') as HTMLElement | null)
        .pop()?.dataset['testid'],
      answers,
    };
  });

test.describe('dialogs', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'measured at a fixed size');
    await page.setViewportSize({ width: 360, height: 740 });
  });

  test('dialogs stack their actions with cancel last', async ({ page }) => {
    for (const [id, { answers }] of Object.entries(DIALOGS)) {
      await openEntry(page, id);
      const m = await measureDialog(page);
      expect(m, `${id}: a dialog is open`).not.toBeNull();
      if (m === null) continue;
      const shown = m.answers.slice(-answers.length);
      expect
        .soft(
          shown.map((answer) => answer.key),
          `${id}: the answers, in order`,
        )
        .toEqual(answers);
      let above = -Infinity;
      for (const answer of shown) {
        expect.soft(answer.left, `${id}: ${answer.key} starts at the edge`).toBeCloseTo(m.left, 0);
        expect.soft(answer.right, `${id}: ${answer.key} ends at the edge`).toBeCloseTo(m.right, 0);
        expect
          .soft(answer.top, `${id}: ${answer.key} sits below the one before`)
          .toBeGreaterThan(above);
        above = answer.bottom;
      }
      if (!m.scrolls) {
        expect.soft(m.last, `${id}: nothing follows the last answer`).toBe(answers.at(-1));
      }
    }
  });

  test('destructive dialogs title with the warning icon', async ({ page }) => {
    for (const [id, { danger }] of Object.entries(DIALOGS)) {
      await openEntry(page, id);
      const m = await measureDialog(page);
      expect(m, `${id}: a dialog is open`).not.toBeNull();
      if (m === null) continue;
      if (danger) {
        expect.soft(m.titleIcon, `${id}: the title starts with the warning icon`).toBe(true);
        await expect
          .soft(page.locator('dialog[open] h2').last(), `${id}: the icon is not read`)
          .toHaveAccessibleName(m.titleName);
      } else {
        expect.soft(m.titleIcons, `${id}: no icon in a safe dialog's title`).toBe(0);
      }
    }
  });

  test("a two-line title's warning icon sits on its first line", async ({ page }) => {
    await openEntry(page, 'table-resign');
    const title = page.locator('dialog[open] h2').last();
    const m = await title.evaluate((heading) => {
      const range = document.createRange();
      range.selectNodeContents(heading.querySelector('span')!);
      const lines = range.getClientRects();
      const icon = heading.querySelector('svg')!.getBoundingClientRect();
      return {
        lines: lines.length,
        first: { top: lines[0]!.top, bottom: lines[0]!.bottom },
        icon: (icon.top + icon.bottom) / 2,
      };
    });
    expect(m.lines, 'the title wraps at 360 px').toBeGreaterThan(1);
    expect(Math.abs(m.icon - (m.first.top + m.first.bottom) / 2)).toBeLessThanOrEqual(1);
  });

  test('the seat-token warning describes Export backup first', async ({ page }) => {
    for (const id of ['delete-all', 'clear-history']) {
      await openEntry(page, id);
      const dialog = page.getByRole('alertdialog');
      await expect(
        dialog.getByRole('button', { name: 'Export backup first' }),
        `${id}: the warning is read with the button`,
      ).toHaveAccessibleDescription(/seat tokens/);
    }
  });
});

/** Where the bar, a banner and the screen's body are, and whether the banner has an icon. */
const measureBanner = (page: Page, testId: string) =>
  page.evaluate((id) => {
    const box = (element: Element | null) => {
      const rect = element?.getBoundingClientRect();
      return rect === undefined
        ? null
        : { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    };
    const banner = document.querySelector(`[data-testid="${id}"]`);
    const main = document.querySelector('[data-part="screen"] main');
    return {
      bar: box(document.querySelector('header.app-bar')),
      banner: box(banner),
      main: box(main),
      inMain: main?.contains(banner) ?? false,
      icon: banner?.querySelector('svg[aria-hidden="true"]') !== null,
    };
  }, testId);

test.describe('banners', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'measured at fixed sizes');
  });

  test('banners sit under the bar', async ({ page }) => {
    for (const size of [
      { width: 360, height: 640 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(size);
      for (const [id, testId] of [
        ['update-banner', 'update-banner'],
        ['connection-banners', 'connection-banner'],
        ['connection-claim-win', 'connection-banner'],
      ] as const) {
        const where = `${id} at ${size.width}×${size.height}`;
        await openEntry(page, id);
        const m = await measureBanner(page, testId);
        expect
          .soft(m.banner?.top, `${where}: right under the bar`)
          .toBeCloseTo(m.bar?.bottom ?? 0, 0);
        expect
          .soft(m.banner?.left, `${where}: as wide as the bar`)
          .toBeCloseTo(m.bar?.left ?? 0, 0);
        expect
          .soft(m.banner?.right, `${where}: as wide as the bar`)
          .toBeCloseTo(m.bar?.right ?? 0, 0);
        expect
          .soft((m.banner?.bottom ?? Infinity) - (m.banner?.top ?? 0), `${where}: a slim strip`)
          .toBeLessThanOrEqual(64);
        expect.soft(m.inMain, `${where}: outside the scrolling body`).toBe(false);
        expect
          .soft(m.main?.top, `${where}: the body follows the banner`)
          .toBeCloseTo(m.banner?.bottom ?? 0, 0);
        expect.soft(m.icon, `${where}: an icon leads the text`).toBe(true);
      }

      // Being connected is not news: the banner takes no room on the Invite screen.
      await openEntry(page, 'invite-waiting');
      const quiet = await measureBanner(page, 'connection-banner');
      expect
        .soft(quiet.main?.top, `invite-waiting at ${size.width}×${size.height}: no banner room`)
        .toBeCloseTo(quiet.bar?.bottom ?? 0, 0);
    }
  });

  test('banners hold an actions row only when they offer an action', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    for (const [id, actions] of [
      ['update-banner', ['Reload']],
      ['connection-banners', []],
      ['connection-claim-win', ['Claim the win', 'Keep waiting']],
    ] as const) {
      await openEntry(page, id);
      const banner = page.locator('[data-part="banners"] > :not(.visually-hidden)');
      await expect(banner, id + ': one banner shows').toHaveCount(1);
      const row = banner.locator('.actions');
      await expect(row, id + ': an actions row only for actions').toHaveCount(
        actions.length > 0 ? 1 : 0,
      );
      if (actions.length > 0) await expect(row.getByRole('button')).toHaveText([...actions]);
    }
  });
});
