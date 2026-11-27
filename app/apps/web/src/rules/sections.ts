import type { MarkerId } from '@wwd/client-core';

export type RulesSection = 'goal' | 'setup' | 'round' | 'markers' | 'characters' | 'fine-points';

/** The sections of the rules, in reading order. */
export const RULES_SECTIONS: readonly RulesSection[] = [
  'goal',
  'setup',
  'round',
  'markers',
  'characters',
  'fine-points',
];

export const isRulesSection = (value: string): value is RulesSection =>
  RULES_SECTIONS.some((section) => section === value);

/** The sections read before and after `section`, or null at either end. */
export function neighbours(section: RulesSection): {
  previous: RulesSection | null;
  next: RulesSection | null;
} {
  const at = RULES_SECTIONS.indexOf(section);
  return { previous: RULES_SECTIONS[at - 1] ?? null, next: RULES_SECTIONS[at + 1] ?? null };
}

export const rulesHref = (section: RulesSection): string => `#/rules/${section}`;

/** A titled part of a section, such as a step of a round: its title and its paragraphs' messages. */
export interface RulesPart {
  title: string;
  paragraphs: readonly string[];
}

/** One block of a section's text, each paragraph or item a message of its own. */
export type RulesBlock =
  | { kind: 'paragraph'; id: string }
  | { kind: 'list'; items: readonly string[] }
  | { kind: 'steps'; steps: readonly RulesPart[] }
  | { kind: 'points'; points: readonly RulesPart[] }
  | { kind: 'markers'; markers: readonly MarkerId[] };

const part = (prefix: string, name: string, paragraphs = 1): RulesPart => ({
  title: `${prefix}-${name}-title`,
  paragraphs: Array.from({ length: paragraphs }, (_, i) =>
    i === 0 ? `${prefix}-${name}` : `${prefix}-${name}-${i + 1}`,
  ),
});

/** The text of every section but the characters, which show the character reference. */
export const RULES_TEXT: Readonly<
  Record<Exclude<RulesSection, 'characters'>, readonly RulesBlock[]>
> = {
  goal: [
    { kind: 'paragraph', id: 'rules-goal-intro' },
    { kind: 'list', items: ['rules-goal-crosses', 'rules-goal-fangs', 'rules-goal-health'] },
    { kind: 'paragraph', id: 'rules-goal-instant' },
    { kind: 'paragraph', id: 'rules-goal-bluff' },
  ],
  setup: [
    { kind: 'paragraph', id: 'rules-setup-cards' },
    { kind: 'paragraph', id: 'rules-setup-markers' },
    { kind: 'paragraph', id: 'rules-setup-badge' },
    { kind: 'paragraph', id: 'rules-setup-hourglass' },
    { kind: 'paragraph', id: 'rules-setup-supply' },
  ],
  round: [
    { kind: 'paragraph', id: 'rules-round-intro' },
    {
      kind: 'steps',
      steps: [
        part('rules-round', 'deal'),
        part('rules-round', 'plan', 2),
        part('rules-round', 'reveal', 3),
        part('rules-round', 'showdown', 3),
        part('rules-round', 'end'),
      ],
    },
  ],
  markers: [
    { kind: 'paragraph', id: 'rules-markers-intro' },
    { kind: 'markers', markers: ['cross', 'fang', 'hourglass', 'potion', 'health', 'badge'] },
  ],
  'fine-points': [
    {
      kind: 'points',
      points: [
        part('rules-fine-points', 'ties'),
        part('rules-fine-points', 'empty-supply'),
        part('rules-fine-points', 'immune'),
        part('rules-fine-points', 'potion'),
        part('rules-fine-points', 'wolf-king'),
        part('rules-fine-points', 'hunter'),
        part('rules-fine-points', 'hand'),
        part('rules-fine-points', 'fool'),
        part('rules-fine-points', 'options', 2),
      ],
    },
  ],
};
