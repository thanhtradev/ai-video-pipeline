import { describe, expect, test } from 'vitest';
import { gatesPassed } from '../scripts/gate-report.mjs';

const PASSED = { ok: true };
const WITHOUT_MIX = { typecheck: PASSED, sfx: PASSED, board: PASSED, textBounds: PASSED };

describe('gatesPassed', () => {
  test('a full run needs the mix', () => {
    expect(gatesPassed({ ...WITHOUT_MIX, mix: PASSED })).toBe(true);
    expect(gatesPassed(WITHOUT_MIX)).toBe(false);
    expect(gatesPassed({ ...WITHOUT_MIX, mix: { ok: false } })).toBe(false);
  });

  test('a draft run passes without the mix', () => {
    expect(gatesPassed(WITHOUT_MIX, { draft: true })).toBe(true);
  });

  test.each(['typecheck', 'sfx', 'board', 'textBounds'])('a draft run still needs %s', (step) => {
    expect(gatesPassed({ ...WITHOUT_MIX, [step]: { ok: false } }, { draft: true })).toBe(false);
    expect(gatesPassed({ ...WITHOUT_MIX, [step]: undefined }, { draft: true })).toBe(false);
  });
});
