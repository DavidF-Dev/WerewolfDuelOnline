import { expect, test, type Locator, type Page } from '@playwright/test';
import { inLanguage, inLanguageTitle, LANGUAGES, openGalleryEntry } from './gallery-entries.js';

/** Each step's title and the coach's text, as the player reads them. */
const STEPS = [
  {
    title: 'Your goal',
    text: 'You win with 4 Crosses or 3 Fangs, or once Alicia has no Health left. These rows of markers keep count.',
  },
  {
    title: 'Make a plan',
    text: "You can't see the cards Alicia holds, so every target is a guess. Most are Werewolves: try the Knight on the Wolfen.",
  },
  {
    title: 'Reveal',
    text: 'Lower initiative acts first: your Knight is 3. If Alicia is playing the Wolfen you targeted, that is 4. Each Hourglass placed lowers initiative by 1. Place 0.',
  },
  {
    title: 'Showdown',
    text: 'The Knight acts first: it gains an Hourglass and hits the Wolfen, which is out before it acts. Alicia loses 1 Health.',
  },
  {
    title: 'Round end',
    text: 'The Badge changes hands, and the card set aside is shown. A real game goes on like this, round after round, until someone wins.',
  },
] as const;

const HAND = ['knight', 'seer', 'witch', 'villager'] as const;
const TARGETS = ['hunter', 'wolf_king', 'wolfen', 'wolf_beauty', 'fool'] as const;

/** Collects the page's uncaught errors, which a step that sends a stray command would raise. */
function pageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

/** The tutorial in one language: each step's label and the coach's text, and the finished page. */
interface Wording {
  label: (n: number, title: string) => string;
  steps: ReadonlyArray<{ title: string; text: string }>;
  done: string;
}

const ENGLISH: Wording = {
  label: (n, title) => `Tutorial · ${n} of 5 · ${title}`,
  steps: STEPS,
  done: "You've played a whole round",
};

const TRANSLATED: Readonly<Record<'de' | 'ja', Wording>> = {
  de: {
    label: (n, title) => `Tutorial · ${n} von 5 · ${title}`,
    steps: [
      {
        title: 'Dein Ziel',
        text: 'Du gewinnst, wenn du 4 Kreuze oder 3 Reißzähne hast oder Lena kein Leben mehr hat. Diese Markerreihen zählen mit.',
      },
      {
        title: 'Plan machen',
        text: 'Die Karten von Lena siehst du nicht, also ist jedes Ziel geraten. Die meisten sind Werwölfe: Schick den Ritter auf den Jungwolf.',
      },
      {
        title: 'Aufdecken',
        text: 'Die niedrigere Initiative ist zuerst dran; dein Ritter hat 3. Spielt Lena den Jungwolf, auf den du zielst, hat er 4. Jede gesetzte Sanduhr zieht 1 ab. Setz 0.',
      },
      {
        title: 'Auflösung',
        text: 'Zuerst ist der Ritter dran: Er erhält eine Sanduhr und trifft den Jungwolf, der so nicht mehr drankommt. Lena verliert 1 Leben.',
      },
      {
        title: 'Rundenende',
        text: 'Das Abzeichen wechselt die Seite, und die beiseitegelegte Karte wird gezeigt. Ein echtes Spiel geht so weiter, Runde um Runde, bis jemand gewinnt.',
      },
    ],
    done: 'Du hast eine ganze Runde gespielt',
  },
  ja: {
    label: (n, title) => `チュートリアル・${n}/5・${title}`,
    steps: [
      {
        title: '目的',
        text: '十字架4個か牙3個を集めるか、さくらの体力を0にすれば勝ちです。マーカーの数はこの2列に表示されます。',
      },
      {
        title: 'プランを立てる',
        text: 'さくらの手札は見えないので、どの対象も推測です。ほとんどが人狼なので、騎士で若狼を狙ってみましょう。',
      },
      {
        title: '公開',
        text: 'イニシアチブが低い方が先です。騎士は3、対象の若狼をさくらが出していればそちらは4です。砂時計1個で1下がります。0個置きましょう。',
      },
      {
        title: '対決',
        text: '騎士が先に行動し、砂時計を得て若狼に命中します。若狼は行動する前に脱落し、さくらの体力が1減ります。',
      },
      {
        title: 'ラウンド終了',
        text: 'バッジの持ち主が替わり、除外されたカードが公開されます。本番のゲームでは、誰かが勝つまでこうしてラウンドを重ねます。',
      },
    ],
    done: '1ラウンドを遊び終えました',
  },
};

async function expectStep(page: Page, n: number, wording: Wording = ENGLISH): Promise<void> {
  const step = wording.steps[n - 1]!;
  await expect(page.getByTestId('phase-step')).toHaveText(wording.label(n, step.title));
  await expect(page.getByTestId('coach-text')).toHaveText(step.text);
  // The table opens with focus on its heading; each later step moves it to the coach.
  await expect(
    n === 1 ? page.getByRole('heading', { level: 1 }) : page.getByTestId('phase-instruction'),
  ).toBeFocused();
}

const disabled = (locator: Locator) => expect(locator).toHaveAttribute('aria-disabled', 'true');
const enabled = (locator: Locator) => expect(locator).not.toHaveAttribute('aria-disabled', 'true');

/** The ring is drawn, dashed, whatever the part's own outline would be. */
async function expectDashed(part: Locator): Promise<void> {
  await expect(part).toHaveClass(/coach-ring/);
  expect(await part.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('dashed');
}

async function expectRinged(page: Page, ids: readonly string[]): Promise<void> {
  for (const id of ids) await expectDashed(page.getByTestId(id).first());
  await expect(page.locator('.coach-ring')).toHaveCount(ids.length);
}

async function startFromHowToPlay(
  page: Page,
  by: 'pointer' | 'keyboard' = 'pointer',
): Promise<void> {
  await page.goto('/#/how-to-play');
  const start = page.getByTestId('how-to-play-start-tutorial');
  if (by === 'keyboard') {
    await start.focus();
    await page.keyboard.press('Enter');
  } else {
    await start.click();
  }
  await expect(page).toHaveURL(/#\/tutorial$/);
  await expect(page.getByTestId('phase-step')).toBeVisible();
}

/** What the player does at each step to reach the next, as the coach asks. */
const MOVES: ReadonlyArray<(page: Page) => Promise<void>> = [
  (page) => page.getByTestId('coach-next').click(),
  async (page) => {
    await page.getByTestId('plan-character-knight').click();
    await page.getByTestId('target-wolfen').click();
    await page.getByTestId('seal-plan').click();
  },
  (page) => page.getByTestId('place-hourglasses').click(),
  async (page) => {
    while (await page.getByTestId('showdown-next').isVisible()) {
      await page.getByTestId('showdown-next').click();
    }
    await page.getByTestId('coach-next').click();
  },
];

/** Plays on from the step the coach shows to step `n`. */
async function playTo(page: Page, n: number): Promise<void> {
  const at = Number(await page.getByTestId('phase-step').getAttribute('data-coach-step'));
  for (let step = at; step < n; step++) {
    await MOVES[step - 1]!(page);
    await expect(page.locator(`[data-coach-step="${step + 1}"]`)).toBeVisible();
  }
}

async function leaveByMenu(page: Page): Promise<void> {
  await page.getByTestId('game-menu-toggle').click();
  const menu = page.getByTestId('game-menu');
  await expect(menu.getByTestId('resign')).toHaveCount(0);
  await expect(menu.getByTestId('pause-after-round')).toHaveCount(0);
  await menu.getByTestId('tutorial-leave').click();
  await expect(page).toHaveURL(/#\/how-to-play$/);
  await expect(page.getByTestId('rules-sections')).toBeVisible();
}

/** Home, History and Stats hold nothing from the tutorial. */
async function expectNothingKept(page: Page): Promise<void> {
  await page.goto('/#/');
  await expect(page.getByTestId('home-create-online')).toBeVisible();
  await expect(page.getByTestId('home-session')).toHaveCount(0);
  await page.goto('/#/history');
  await expect(page.getByTestId('history-empty')).toBeVisible();
  await page.goto('/#/stats');
  await expect(page.getByTestId('stats-empty')).toBeVisible();
}

test('plays the tutorial from How to play to the end', async ({ page }) => {
  const errors = pageErrors(page);
  await page.goto('/#/');
  await expect(page.getByTestId('home-newcomer')).toBeVisible();
  await startFromHowToPlay(page, 'keyboard');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tutorial');

  // 1: nothing to choose yet; the coach's Next stands in for Seal plan.
  await expectStep(page, 1);
  await expectRinged(page, ['opponent-markers', 'my-markers']);
  // The hand is shown as it is, neither crossed out nor choosable, and the targets are not faded.
  for (const c of HAND) {
    const card = page.getByTestId(`plan-character-${c}`);
    await enabled(card);
    await expect(card).not.toHaveAttribute('aria-pressed');
    await expect(card).toHaveAccessibleDescription(STEPS[0].text);
  }
  await expect(page.locator('.frame.crossed, .frame.faded')).toHaveCount(0);
  await page.getByTestId('plan-character-knight').click();
  await expect(page.locator('.frame.selected')).toHaveCount(0);
  await expect(page.getByTestId('seal-plan')).toHaveCount(0);
  await expect(page.getByTestId('phase-hint')).toHaveCount(0);

  // 2: only the Knight, and then only the Wolfen.
  await playTo(page, 2);
  await expectStep(page, 2);
  await expectRinged(page, ['plan-character-knight', 'target-slot-wolfen']);
  await enabled(page.getByTestId('plan-character-knight'));
  for (const c of HAND.slice(1)) await disabled(page.getByTestId(`plan-character-${c}`));
  await expect(page.getByTestId('plan-character-seer')).toHaveAccessibleDescription(STEPS[1].text);
  await page.getByTestId('plan-character-knight').click();
  // Chosen, and then focused by keyboard, the Knight keeps its ring and shows its focus as well.
  const knight = page.getByTestId('plan-character-knight');
  const shadow = () => knight.evaluate((element) => getComputedStyle(element).boxShadow);
  await expectDashed(knight);
  const unfocused = await shadow();
  await knight.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(knight).toBeFocused();
  await expectDashed(knight);
  expect(await shadow()).not.toBe(unfocused);
  for (const t of TARGETS) {
    const card = page.getByTestId(`target-${t}`);
    await (t === 'wolfen' ? enabled(card) : disabled(card));
  }
  await expect(page.getByTestId('seal-plan')).toBeDisabled();
  await page.getByTestId('target-wolfen').click();
  await page.getByTestId('seal-plan').click();
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);

  // 3: only 0 Hourglasses can be placed.
  await expectStep(page, 3);
  await expectRinged(page, ['side-pill-opponent']);
  await expect(page.getByTestId('place-hourglasses')).toHaveText('Place 0 Hourglasses');
  await disabled(page.getByTestId('hourglass-more'));
  await disabled(page.getByTestId('hourglass-fewer'));
  await page.getByTestId('place-hourglasses').click();

  // 4: the Knight hits the Wolfen before it acts.
  await expectStep(page, 4);
  await expect(page.getByTestId('coach-next')).toHaveCount(0);
  await expect(page.getByTestId('action-next-round')).toHaveCount(0);
  await expectRinged(page, ['opponent-health', 'my-hourglass']);
  while (await page.getByTestId('showdown-next').isVisible()) {
    await page.getByTestId('showdown-next').click();
  }
  await expect(page.getByTestId('showdown-out')).toContainText('Wolfen');
  await expect(page.getByTestId('opponent-health')).toContainText('Health: 1');
  await expect(page.getByTestId('my-hourglass')).toContainText('Hourglasses: 1');
  await expect(page.getByTestId('action-next-round')).toHaveCount(0);
  await page.getByTestId('coach-next').click();

  // 5: the round's end; Finish closes the tutorial.
  await expectStep(page, 5);
  await expectRinged(page, ['round-badge', 'round-set-aside']);
  await expect(page.getByTestId('coach-next')).toHaveText('Finish');
  await page.getByTestId('coach-next').click();

  await expect(page.getByTestId('tutorial-done')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByTestId('tutorial-done-learned').getByRole('listitem')).toHaveCount(4);
  await expect(page.getByTestId('tutorial-done-play')).toHaveAttribute('href', '#/online/new');
  await expect(page.getByTestId('tutorial-done-rules')).toHaveAttribute('href', '#/rules/goal');
  await page.getByTestId('tutorial-done-again').click();
  await expectStep(page, 1);

  await page.goto('/#/how-to-play');
  await expect(page.getByTestId('how-to-play-tutorial').getByRole('heading')).toHaveText(
    'Tutorial finished',
  );
  await expect(page.getByTestId('how-to-play-start-tutorial')).toHaveText('Play it again');
  await page.goto('/#/');
  await expect(page.getByTestId('home-create-online')).toBeVisible();
  await expect(page.getByTestId('home-newcomer')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('leaving at every step returns to How to play and sends nothing more', async ({ page }) => {
  const errors = pageErrors(page);
  for (let n = 1; n <= STEPS.length; n++) {
    await startFromHowToPlay(page);
    await playTo(page, n);
    await expectStep(page, n);
    await leaveByMenu(page);
  }
  // Left while the opponent's Hourglasses are still to come.
  await startFromHowToPlay(page);
  await playTo(page, 3);
  await page.getByTestId('place-hourglasses').click();
  await leaveByMenu(page);
  // Back and a reload leave it too.
  await startFromHowToPlay(page);
  await page.goBack();
  await expect(page).toHaveURL(/#\/how-to-play$/);
  await startFromHowToPlay(page);
  await page.reload();
  await expect(page).toHaveURL(/#\/how-to-play$/);
  await expect(page.getByTestId('rules-sections')).toBeVisible();

  // Long enough for any scripted move still waiting to have been sent.
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
  await expectNothingKept(page);
  await page.goto('/#/');
  await expect(page.getByTestId('home-newcomer')).toBeVisible();
});

for (const lang of ['de', 'ja'] as const) {
  test(
    inLanguageTitle('plays the tutorial through in the chosen language', lang),
    async ({ page }) => {
      const errors = pageErrors(page);
      const wording = TRANSLATED[lang];
      await page.goto('/#/settings');
      await page.getByRole('combobox', { name: 'Language' }).selectOption(lang);
      await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${lang}-`));
      await startFromHowToPlay(page);
      for (let n = 1; n <= wording.steps.length; n++) {
        await expectStep(page, n, wording);
        if (n < wording.steps.length) await playTo(page, n + 1);
      }
      await page.getByTestId('coach-next').click();
      await expect(page.getByTestId('tutorial-done')).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: wording.done })).toBeVisible();
      expect(errors).toEqual([]);
    },
  );
}

for (const lang of LANGUAGES) {
  test(inLanguageTitle('the coach fits in three lines', lang), async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'measured at a fixed size');
    await page.setViewportSize({ width: 360, height: 640 });
    for (const id of [
      'tutorial-goal',
      'tutorial-plan',
      'tutorial-reveal',
      'tutorial-showdown',
      'tutorial-round-end',
    ]) {
      await openGalleryEntry(page, id, inLanguage(lang));
      const lines = await page.getByTestId('coach-text').evaluate((text) => {
        const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
        return Math.round(text.getBoundingClientRect().height / lineHeight);
      });
      expect(lines, id).toBeLessThanOrEqual(3);
    }
  });
}

test('the tutorial ignores showdown speed, confirm plan and rules hints', async ({ page }) => {
  // Each set the other way from how the tutorial plays: results at once, a seal to confirm, hints.
  await page.goto('/#/settings');
  const main = page.getByRole('main');
  await main.getByRole('radio', { name: 'Instant' }).check();
  await expect(main.getByRole('radio', { name: 'Instant' })).toBeChecked();
  for (const name of ['Confirm before sealing a plan', 'Rules hints']) {
    await expect(main.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'true');
  }

  await startFromHowToPlay(page);
  await expect(page.getByTestId('phase-hint')).toHaveCount(0);
  await playTo(page, 2);
  await expect(page.getByTestId('phase-hint')).toHaveCount(0);
  await playTo(page, 3);
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(page.getByTestId('phase-hint')).toHaveCount(0);
  await playTo(page, 4);
  await expect(page.getByTestId('showdown-next')).toBeVisible();
  await expect(page.getByTestId('showdown-step')).toHaveCount(1);
  await page.getByTestId('log-toggle').click();
  await expect(page.getByTestId('rules-plan-hint')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await playTo(page, 5);
  await page.getByTestId('coach-next').click();
  await expect(page.getByTestId('tutorial-done')).toBeVisible();
});
