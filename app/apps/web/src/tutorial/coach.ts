import type { Localiser, RichPart } from '@wwd/client-core';
import { rulesParts } from '../rules/text.js';
import { TUTORIAL_STEPS, type TutorialAllow, type TutorialStep } from './script.js';

/** What the coach in the phase bar shows and allows at one step of the tutorial. */
export interface Coach {
  /** The step's number, from 1. */
  step: number;
  /** How many steps there are. */
  count: number;
  title: string;
  text: readonly RichPart[];
  /** data-testid values of what the step is about, drawn with a ring */
  ring: readonly string[];
  allow: TutorialAllow;
  /** The coach's own button; null when the step's real action button is used. */
  button: { label: string; run: () => void } | null;
}

/** The coach for `step`; its button, on a step the player only reads, calls `next`. */
export function coachFor(l: Localiser, step: TutorialStep, next: () => void): Coach {
  const index = TUTORIAL_STEPS.indexOf(step);
  const last = index === TUTORIAL_STEPS.length - 1;
  return {
    step: index + 1,
    count: TUTORIAL_STEPS.length,
    title: l.t(`tutorial-${step.id}-title`),
    text: rulesParts(l, `tutorial-${step.id}-text`),
    ring: step.ring,
    allow: step.allow,
    button:
      step.advance === 'next'
        ? { label: l.t(last ? 'tutorial-finish' : 'tutorial-next'), run: next }
        : null,
  };
}
