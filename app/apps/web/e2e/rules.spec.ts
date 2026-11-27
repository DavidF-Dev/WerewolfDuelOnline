import { expect, test } from '@playwright/test';

const TITLES = ['The goal', 'Setting up', 'A round', 'Markers', 'Characters', 'Fine points'];

test('Next walks the rules from the goal to the fine points, and Back returns to How to play', async ({
  page,
}) => {
  await page.goto('/#/how-to-play');
  await page.getByTestId('rules-section-goal').click();
  await expect(page).toHaveURL(/#\/rules\/goal$/);
  for (const [i, title] of TITLES.entries()) {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.getByTestId('rules-progress')).toHaveText(`Rules · ${i + 1} of 6`);
    await expect(page.getByTestId('unofficial-notice')).toBeVisible();
    if (i === 0) await expect(page.getByTestId('rules-previous')).toHaveCount(0);
    if (i === TITLES.length - 1) {
      await expect(page.getByTestId('rules-next')).toHaveCount(0);
    } else {
      await page.getByTestId('rules-next').click();
    }
  }
  await expect(page).toHaveURL(/#\/rules\/fine-points$/);
  await page.getByRole('banner').getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/#\/how-to-play$/);
  await expect(page.getByTestId('rules-sections')).toBeVisible();
});

test('an unknown rules section opens How to play', async ({ page }) => {
  await page.goto('/#/rules/nope');
  await expect(page.getByTestId('rules-sections')).toBeVisible();
});
