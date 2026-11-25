import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { Event, EventKind } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import RoundSummary from '../../src/table/RoundSummary.svelte';

const localiser = createLocaliser('en');

function sequenced(kinds: EventKind[]): Array<[number, Event]> {
  return kinds.map((kind, seq) => [seq, { visibility: 'public', kind }]);
}

const round = (n: number, badge: 'p0' | 'p1' = 'p0'): EventKind[] => [
  { round_started: { round: n, badge } },
  { character_resolved: { seat: 'p0', character: 'villager' } },
  { round_ended: { round: n, next_badge: badge === 'p0' ? 'p1' : 'p0' } },
];

const flat = (element: Element | null): string | null =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

function summarise(kinds: EventKind[], n: number) {
  render(RoundSummary, { props: { localiser, events: sequenced(kinds), seat: 'p0', round: n } });
  const summary = screen.getByTestId('round-summary');
  return {
    summary,
    setAside: flat(summary.querySelector('[data-testid="round-set-aside"]')),
    badge: flat(summary.querySelector('[data-testid="round-badge"]')),
  };
}

describe('RoundSummary', () => {
  it('round summary shows the discarded card', () => {
    const { summary, setAside, badge } = summarise(
      [
        ...round(1),
        { discard_revealed: { round: 1, character: 'seer' } },
        { next_round_requested: { seat: 'p0' } },
        ...round(2),
      ],
      1,
    );
    expect(summary).toBe(screen.getByRole('region', { name: 'Round 1 summary' }));
    expect(setAside).toBe('Set aside: Seer');
    const bold = screen.getByTestId('round-set-aside').querySelector('strong');
    expect(bold?.textContent).toBe('Seer');
    const card = within(summary).getByTestId('round-set-aside-card');
    expect(card.getAttribute('aria-label')).toMatch(/^5, Seer, /);
    expect(card.closest('.card')?.classList, 'a target-size card').toContain('target');
    expect(badge).toBe('Your opponent takes the Badge for round 2.');
  });

  it('ends a round without a reveal at its end', () => {
    const { setAside, badge } = summarise(
      [...round(1), { next_round_requested: { seat: 'p0' } }, ...round(2)],
      1,
    );
    expect(setAside).toBeNull();
    expect(screen.queryByTestId('round-set-aside-card')).toBeNull();
    expect(badge).toBe('Your opponent takes the Badge for round 2.');
  });

  it('says when the Badge stays with you', () => {
    const { badge } = summarise(
      [
        { round_started: { round: 3, badge: 'p1' } },
        { round_ended: { round: 3, next_badge: 'p0' } },
      ],
      3,
    );
    expect(badge).toBe('You take the Badge for round 4.');
  });
});
