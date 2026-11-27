import type { Character, Command, Seat, TargetCard } from '@wwd/engine';

/** The room's random seed, found by searching: it deals the hands the tutorial teaches with. */
export const TUTORIAL_SEED = '0000000000000000000000000000000000000000000000000000000000000015';

/** The player's seat, which joins first and holds the Badge in round 1. */
export const TUTORIAL_PLAYER_SEAT: Seat = 'p0';

export type TutorialStepId = 'goal' | 'plan' | 'reveal' | 'showdown' | 'round-end';

/** The one choice the player is offered at a step; a field left out offers nothing of that kind. */
export interface TutorialAllow {
  character?: Character;
  targets?: readonly TargetCard[];
  hourglasses?: number;
}

export interface TutorialStep {
  id: TutorialStepId;
  /** data-testid values the coach rings */
  ring: readonly string[];
  /** 'next': explain only; 'game': the player's real action ends the step */
  advance: 'next' | 'game';
  /** what the player may choose at this step */
  allow: TutorialAllow;
  /** the opponent's move at this step, sent when the engine asks for it */
  opponent: Command | null;
}

/** One round: the player plans the Knight against the Wolfen, which the opponent plans against the Seer. */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'goal',
    ring: ['opponent-markers', 'my-markers'],
    advance: 'next',
    allow: {},
    opponent: null,
  },
  {
    id: 'plan',
    ring: ['plan-character-knight', 'target-slot-wolfen'],
    advance: 'game',
    allow: { character: 'knight', targets: [{ character: 'wolfen' }] },
    opponent: { submit_plan: { character: 'wolfen', targets: [{ character: 'seer' }] } },
  },
  {
    id: 'reveal',
    ring: ['side-pill-opponent'],
    advance: 'game',
    allow: { hourglasses: 0 },
    opponent: { place_hourglasses: { n: 0 } },
  },
  {
    id: 'showdown',
    ring: ['opponent-health', 'my-hourglass'],
    advance: 'next',
    allow: {},
    opponent: null,
  },
  {
    id: 'round-end',
    ring: ['round-badge', 'round-set-aside'],
    advance: 'next',
    allow: {},
    opponent: null,
  },
];

/** The player's command a step allows, or null when it allows no command. */
export function allowedCommand(allow: TutorialAllow): Command | null {
  if (allow.character !== undefined) {
    return { submit_plan: { character: allow.character, targets: [...(allow.targets ?? [])] } };
  }
  if (allow.hourglasses !== undefined) return { place_hourglasses: { n: allow.hourglasses } };
  return null;
}
