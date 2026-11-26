import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { engineFtl } from '@wwd/engine';
import { localiserFromSources } from '@wwd/client-core';
import { planSummaryParts } from '../src/text.js';

const repository = join(process.cwd(), '../../..');
const read = (path: string): string => readFileSync(join(repository, path), 'utf8');

describe('plan summary', () => {
  it('the Fool in a plan summary takes the form the summary declares', () => {
    const l = localiserFromSources(
      'en',
      'en-GB',
      [engineFtl['en']!, read('app/packages/client-core/locales/en/ui.ftl')],
      [
        read('engine/crates/wwd-cli/tests/fixtures/grammar.ftl'),
        `plan-summary-short = { CHARACTER($character) } → { $targets }
    .list-case = acc
    .list-article = none
plan-summary-fool = { $case ->
        [acc] Narren
       *[other] Narr
    }
`,
      ],
    );
    expect(
      planSummaryParts(l, { character: 'hunter', targets: [{ character: 'witch' }, 'fool'] }),
    ).toEqual([
      { character: 'Jäger' },
      { text: ' → ' },
      { character: 'Hexe' },
      { text: ' + ' },
      { character: 'Narren' },
    ]);
  });
});
