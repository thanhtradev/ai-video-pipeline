import { describe, expect, test } from 'vitest';
import { sumUsage } from '../../src/claude/usage.js';

describe('sumUsage', () => {
  test('adds the token counts of several CLI runs', () => {
    const total = sumUsage([
      {
        input_tokens: 10,
        output_tokens: 200,
        cache_read_input_tokens: 5000,
        cache_creation_input_tokens: 300,
        service_tier: 'standard',
      },
      { input_tokens: 4, output_tokens: 50, cache_read_input_tokens: 7000 },
    ]);

    expect(total).toEqual({
      input_tokens: 14,
      output_tokens: 250,
      cache_read_input_tokens: 12000,
      cache_creation_input_tokens: 300,
    });
  });

  test('skips runs with no usage and fields that are not numbers', () => {
    const total = sumUsage([null, undefined, { input_tokens: '7', output_tokens: 3 }]);

    expect(total).toEqual({
      input_tokens: 0,
      output_tokens: 3,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
  });
});
