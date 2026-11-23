import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { Command, Plan, Seat, TargetCard } from '@wwd/engine';

const MAX_ROUNDS = 200;
// The referee drops messages beyond 30 per rolling 10 s per connection; 26 commands leave room
// for the greeting, the first ping and one request, such as to pause, resume or rematch.
const SEND_BUDGET = 26;
const BUDGET_WINDOW_MS = 10_000;

/** A small seeded generator for move choices; it does not fix the deal. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Snapshot {
  status: string;
  seat: Seat | null;
  round: number;
  lastSeq: number;
  errorCount: number;
  lastError: string | null;
  /** Whether the events this page holds deal cards to the seat it is not playing. */
  sawOtherHand: boolean;
  /** How the other seat's plan appears to this page. */
  otherPlan: string;
  myPlan: string;
  plansRevealed: number;
  legal: Command[];
  /** The hand of the seat this page is not playing; null whenever hiding works. */
  otherHand: unknown;
  replayVerified: boolean | null;
  opponentConnected: boolean;
  opponentCanClaim: boolean;
  /** The online connection's phase; null in a local game. */
  phase: string | null;
  /** Which of the room's games the page follows, from 0. */
  game: number;
  paused: boolean;
  /** Who holds the Badge; null before the first deal. */
  badge: Seat | null;
  /** The winner of the page's game; null until it is over. */
  winner: Seat | null;
  /** How many segments the page's game-over replay has; 0 before game over. */
  segments: number;
}

export const snapshot = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => {
    const kind = (plan: unknown): string =>
      typeof plan === 'string' ? plan : Object.keys(plan as object)[0]!;
    const s = window.__wwd!.state();
    return {
      status: s.status,
      seat: s.seat,
      round: s.view?.round ?? 0,
      lastSeq: s.lastSeq,
      errorCount: s.errorCount,
      lastError: s.lastError,
      sawOtherHand: s.events.some(
        ([, e]) => 'hand_dealt' in e.kind && e.kind.hand_dealt.seat !== s.seat,
      ),
      otherPlan: s.view === null ? 'none' : kind(s.view.players[s.seat === 'p0' ? 1 : 0]!.plan),
      myPlan:
        s.view === null || s.seat === null
          ? 'none'
          : kind(s.view.players[s.seat === 'p0' ? 0 : 1]!.plan),
      plansRevealed: s.events.filter(([, e]) => 'plans_revealed' in e.kind).length,
      legal: s.legal,
      otherHand: s.view === null ? undefined : s.view.players[s.seat === 'p0' ? 1 : 0]!.hand,
      replayVerified: s.replayVerified,
      opponentConnected: s.opponent.connected,
      opponentCanClaim: s.opponent.can_claim_win === true,
      phase: window.__wwd!.connection()?.phase ?? null,
      game: s.game,
      paused: s.pause.paused,
      badge: s.view?.badge ?? null,
      winner:
        s.events.map(([, e]) => e.kind).find((kind) => 'game_over' in kind)?.game_over.winner ??
        null,
      segments: s.replay?.segments.length ?? 0,
    };
  });

interface Ledger {
  /** The `last_seq` of each `hello` or `rejoin` sent, in order; 0 when it was left out. */
  resumedFrom: number[];
  /** Events received that the socket's greeting said were already held, or received twice. */
  repeated: number[];
}

const ledgers = new WeakMap<Page, Ledger>();

/**
 * Records what `page` says and hears over its room sockets: where each greeting resumes from,
 * and every event sent again although the page already had it. Call it before the page connects.
 */
export function recordEvents(page: Page): void {
  const ledger: Ledger = { resumedFrom: [], repeated: [] };
  ledgers.set(page, ledger);
  page.on('websocket', (socket) => {
    if (!socket.url().includes('/rooms/')) return;
    let from = 0;
    const seen = new Set<number>();
    socket.on('framesent', ({ payload }) => {
      const msg = JSON.parse(String(payload)) as { type: string; last_seq?: number };
      if (msg.type !== 'hello' && msg.type !== 'rejoin') return;
      from = msg.last_seq ?? 0;
      ledger.resumedFrom.push(from);
    });
    socket.on('framereceived', ({ payload }) => {
      const msg = JSON.parse(String(payload)) as { type: string; events?: Array<[number]> };
      if (msg.type !== 'events') return;
      for (const [seq] of msg.events ?? []) {
        if (seq < from || seen.has(seq)) ledger.repeated.push(seq);
        seen.add(seq);
      }
    });
  });
}

/** Events `page` was sent although it already had them; empty when it is not recorded. */
export const repeatedEvents = (page: Page): number[] => ledgers.get(page)?.repeated ?? [];

/** The `last_seq` of each greeting `page` has sent, in order; empty when it is not recorded. */
export const resumedFrom = (page: Page): number[] => ledgers.get(page)?.resumedFrom ?? [];

/** The two seats' pages; a test may replace one mid-game, as when a seat moves to a new device. */
export interface Table {
  host: Page;
  guest: Page;
}

/** Opens a host page and a guest page in one context and joins them. */
export async function openTable(context: BrowserContext): Promise<Table> {
  const host = await context.newPage();
  await host.goto('/#/local/host');
  const code = (await host.getByTestId('join-code').textContent()) ?? '';
  const guest = await context.newPage();
  await guest.goto('/#/local/join');
  await guest.getByTestId('join-code-input').fill(code.trim());
  await guest.getByTestId('join-submit').click();
  await expect(host.getByTestId('table')).toBeVisible();
  await expect(guest.getByTestId('table')).toBeVisible();
  return { host, guest };
}

/** How long a seat may stay away in an online test room before its opponent can claim the win. */
export const GRACE_MS = 3_000;

/** A 64-hex-digit room seed made from `n`, so each test deals its own fixed game. */
export const roomSeed = (n: number): string => n.toString(16).padStart(8, '0').repeat(8);

export interface OnlineTable extends Table {
  code: string;
  hostContext: BrowserContext;
  guestContext: BrowserContext;
}

/** Creates a seeded online test room from a page that has loaded the app; returns its code. */
export async function createSeededRoom(page: Page, seed: string): Promise<string> {
  await page.waitForFunction(() => window.__wwd !== undefined);
  const { code } = await page.evaluate(
    ([seed, graceMs]) => window.__wwd!.createOnline({ test: { seed, grace_ms: graceMs } }),
    [seed, GRACE_MS] as const,
  );
  return code;
}

/** Answers the display name question that a device asks before it first connects. */
export async function giveName(page: Page, name: string): Promise<void> {
  await page.getByTestId('display-name').fill(name);
  await page.getByTestId('name-continue').click();
}

/** Opens `url` on a device that has not played before and answers the display name question. */
export async function joinAs(page: Page, url: string, name: string): Promise<void> {
  await page.goto(url);
  await giveName(page, name);
}

/** Opens a host and a guest on separate devices (browser contexts) and seats them in a seeded room. */
export async function openOnlineTable(browser: Browser, seed: string): Promise<OnlineTable> {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  recordEvents(host);
  await host.goto('/');
  const code = await createSeededRoom(host, seed);
  await joinAs(host, `/#/join/${code}`, 'Host');
  await expect(host.getByTestId('invite')).toBeVisible();
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  recordEvents(guest);
  await joinAs(guest, `/#/join/${code}`, 'Guest');
  await expect(host.getByTestId('table')).toBeVisible();
  await expect(guest.getByTestId('table')).toBeVisible();
  return { host, guest, code, hostContext, guestContext };
}

export const targetId = (card: TargetCard): string => (card === 'fool' ? 'fool' : card.character);

/** The test id of the button that sends `cmd` once its panel is ready. */
function buttonFor(cmd: Command): string {
  if (cmd === 'next_round') return 'action-next-round';
  if (typeof cmd === 'object' && 'choose_potion_target' in cmd) {
    return `action-potion-${cmd.choose_potion_target.card}`;
  }
  if (typeof cmd === 'object' && 'hunter_spend_cross' in cmd) {
    return cmd.hunter_spend_cross.spend ? 'action-hunter-spend' : 'action-hunter-keep';
  }
  throw new Error(`no button for ${JSON.stringify(cmd)}`);
}

export const isPlan = (cmd: Command): cmd is Extract<Command, { submit_plan: Plan }> =>
  typeof cmd === 'object' && 'submit_plan' in cmd;

async function performPlan(page: Page, plan: Plan): Promise<void> {
  await page.getByTestId(`plan-character-${plan.character}`).click();
  for (const card of plan.targets) await page.getByTestId(`target-${targetId(card)}`).click();
  await page.getByTestId('seal-plan').click();
  // A fresh device asks before sealing a plan.
  await page.getByRole('alertdialog').getByTestId('confirm-yes').click();
}

/** Steps the Hourglass stepper to `n` and places them. */
async function performHourglasses(page: Page, n: number): Promise<void> {
  const count = page.getByTestId('hourglass-count');
  for (let i = 0; i < 10; i += 1) {
    const shown = Number(await count.getAttribute('data-value'));
    if (shown === n) break;
    await page.getByTestId(shown < n ? 'hourglass-more' : 'hourglass-fewer').click();
  }
  await expect(count).toHaveAttribute('data-value', String(n));
  await page.getByTestId('place-hourglasses').click();
}

/** Steps through any showdown results still to be shown, so the prompts after them appear. */
async function catchUpShowdown(page: Page): Promise<void> {
  const next = page.getByTestId('showdown-next');
  while (await next.isVisible()) await next.click();
}

/** Opens the game menu if it is closed. */
export async function openGameMenu(page: Page): Promise<void> {
  const menu = page.getByTestId('game-menu');
  if ((await menu.getAttribute('open')) === null)
    await page.getByTestId('game-menu-toggle').click();
  await expect(menu).toHaveAttribute('open', '');
}

/** Resigns through the game menu, confirming the question it asks. */
export async function resign(page: Page): Promise<void> {
  await openGameMenu(page);
  await page.getByTestId('resign').click();
  await page.getByRole('alertdialog').getByTestId('confirm-yes').click();
}

/** Performs `cmd` through the visible controls. */
export async function perform(page: Page, cmd: Command): Promise<void> {
  if (isPlan(cmd)) {
    await performPlan(page, cmd.submit_plan);
  } else if (typeof cmd === 'object' && 'place_hourglasses' in cmd) {
    await performHourglasses(page, cmd.place_hourglasses.n);
  } else if (cmd === 'resign') {
    await resign(page);
  } else {
    if (typeof cmd === 'object' && 'hunter_spend_cross' in cmd) await catchUpShowdown(page);
    await page.getByTestId(buttonFor(cmd)).click();
  }
}

export interface PlayOptions {
  random: () => number;
  /** Runs after every command with the number of commands played so far. */
  afterStep?: (step: number, table: Table) => Promise<void>;
  /** Defers a page's next command while it returns true. */
  hold?: (page: Page, s: Snapshot, table: Table) => boolean;
  /** Stops early, before game over, once this holds for both pages. */
  until?: (s: Snapshot) => boolean;
}

/**
 * Waits until the referee has answered the command `page` sent from state `before`: its offer
 * changes with every accepted command, and a refusal counts as an error. Until then, events about
 * the opponent can arrive with the old offer, which must not be taken as a new one.
 */
async function answered(page: Page, before: Snapshot): Promise<void> {
  await page.waitForFunction(
    ([status, errors, legal]) => {
      const s = window.__wwd!.state();
      return s.status !== status || s.errorCount !== errors || JSON.stringify(s.legal) !== legal;
    },
    [before.status, before.errorCount, JSON.stringify(before.legal)] as const,
    { timeout: 10_000 },
  );
}

/**
 * Plays both seats through the UI, choosing a random legal command each time, until game over
 * or until `options.until` holds for both pages; returns the number of commands played.
 */
export async function playToEnd(table: Table, options: PlayOptions): Promise<number> {
  const pages = (): Page[] => [table.host, table.guest];
  // Each page is keyed by what it last acted on, so a stale offer is not acted on twice.
  const acted = new Map<Page, string>();
  const sent = new Map<Page, number[]>();
  const key = (s: Snapshot): string => `${s.lastSeq}|${JSON.stringify(s.legal)}`;
  const pending = (page: Page, s: Snapshot): boolean =>
    s.legal.length > 0 && acted.get(page) !== key(s) && !(options.hold?.(page, s, table) ?? false);
  let steps = 0;
  for (;;) {
    let progressed = false;
    let over = 0;
    let done = 0;
    for (const seat of ['host', 'guest'] as const) {
      const page = table[seat];
      const s = await snapshot(page);
      if (options.until?.(s) === true) {
        done += 1;
        continue;
      }
      expect(repeatedEvents(page), 'no event should reach a page twice').toEqual([]);
      expect(s.errorCount, `the referee rejected something: ${s.lastError ?? 'unknown'}`).toBe(0);
      expect(s.round, 'the game should end within the round cap').toBeLessThanOrEqual(MAX_ROUNDS);
      if (s.status === 'game_over') {
        over += 1;
        continue;
      }
      if (!pending(page, s)) continue;
      const cmd = s.legal[Math.floor(options.random() * s.legal.length)]!;
      const times = sent.get(page) ?? [];
      sent.set(page, times);
      await expect
        .poll(() => times.filter((t) => Date.now() - t < BUDGET_WINDOW_MS).length, {
          message: 'waiting for room in the rolling message budget',
          timeout: BUDGET_WINDOW_MS + 2_000,
        })
        .toBeLessThan(SEND_BUDGET);
      await perform(page, cmd);
      times.push(Date.now());
      acted.set(page, key(s));
      await answered(page, s);
      steps += 1;
      progressed = true;
      await options.afterStep?.(steps, table);
    }
    if (over === 2 || done === 2) return steps;
    if (!progressed) {
      await expect
        .poll(
          async () => {
            const current = pages();
            const states = await Promise.all(current.map(snapshot));
            const stopped = options.until !== undefined && states.every(options.until);
            return (
              stopped || states.some((s, i) => s.status === 'game_over' || pending(current[i]!, s))
            );
          },
          { message: 'a page should be offered a command or the game should end' },
        )
        .toBe(true);
    }
  }
}

export async function expectGameOver(table: Table): Promise<void> {
  for (const page of [table.host, table.guest]) {
    await expect(page.getByRole('heading', { name: 'Game over' })).toBeVisible();
    await expect.poll(async () => (await snapshot(page)).replayVerified).toBe(true);
    expect(repeatedEvents(page), 'no event should reach a page twice').toEqual([]);
  }
}

/** Presses Tab until the control with `testId` has focus. */
export async function tabTo(page: Page, testId: string): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    const focused = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.dataset['testid'] ?? '',
    );
    if (focused === testId) return;
    await page.keyboard.press('Tab');
  }
  await expect(page.getByTestId(testId)).toBeFocused();
}
