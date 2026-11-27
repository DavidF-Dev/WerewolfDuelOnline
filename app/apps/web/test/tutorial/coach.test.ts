import { describe, expect, it, vi } from 'vitest';
import { createLocaliser, plainText } from '@wwd/client-core';
import { coachFor } from '../../src/tutorial/coach.js';
import { TUTORIAL_STEPS } from '../../src/tutorial/script.js';

const l = createLocaliser('en');

describe('coachFor', () => {
  it("gives each step's number, title and text", () => {
    const coaches = TUTORIAL_STEPS.map((step) => coachFor(l, step, () => {}));
    expect(coaches.map(({ step, count }) => `${step}/${count}`)).toEqual([
      '1/5',
      '2/5',
      '3/5',
      '4/5',
      '5/5',
    ]);
    expect(coaches.map((coach) => coach.title)).toEqual([
      'Your goal',
      'Make a plan',
      'Reveal',
      'Showdown',
      'Round end',
    ]);
    expect(coaches.map((coach) => plainText(coach.text))).toEqual([
      'You win with 4 Crosses or 3 Fangs, or once Alicia has no Health left. These rows of markers keep count.',
      "You can't see the cards Alicia holds, so every target is a guess. Most are Werewolves: try the Knight on the Wolfen.",
      'Lower initiative acts first: your Knight is 3. If Alicia is playing the Wolfen you targeted, that is 4. Each Hourglass placed lowers initiative by 1. Place 0.',
      'The Knight acts first: it gains an Hourglass and hits the Wolfen, which is out before it acts. Alicia loses 1 Health.',
      'The Badge changes hands, and the card set aside is shown. A real game goes on like this, round after round, until someone wins.',
    ]);
  });

  it('names the characters in bold and draws the marker tokens', () => {
    const plan = coachFor(l, TUTORIAL_STEPS[1]!, () => {});
    expect(plan.text.filter((part) => 'character' in part)).toEqual([
      { character: 'Knight' },
      { character: 'Wolfen' },
    ]);
    const goal = coachFor(l, TUTORIAL_STEPS[0]!, () => {});
    expect(goal.text.flatMap((part) => ('marker' in part ? [part.marker] : []))).toEqual([
      'cross',
      'fang',
      'health',
    ]);
  });

  it('offers Next on the explain-only steps, Finish on the last, and the real action otherwise', () => {
    const next = vi.fn();
    const coaches = TUTORIAL_STEPS.map((step) => coachFor(l, step, next));
    expect(coaches.map((coach) => coach.button?.label ?? null)).toEqual([
      'Next',
      null,
      null,
      'Next',
      'Finish',
    ]);
    coaches[0]!.button!.run();
    coaches[4]!.button!.run();
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("passes on the step's rings and the choice it allows", () => {
    for (const step of TUTORIAL_STEPS) {
      const coach = coachFor(l, step, () => {});
      expect(coach.ring).toBe(step.ring);
      expect(coach.allow).toBe(step.allow);
    }
  });
});
