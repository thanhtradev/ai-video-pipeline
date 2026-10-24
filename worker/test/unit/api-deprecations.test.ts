import { afterEach, expect, test, vi } from 'vitest';
import { buildApi } from '../../src/api.js';
import { createMemoryNonceStore } from '../../src/security/hmac.js';

// Separate file: Fastify emits each deprecation warning once per process, so this must run before
// any other test in the same worker builds the API.

afterEach(() => {
  vi.restoreAllMocks();
});

test('building the api emits no Fastify deprecation warnings', async () => {
  const emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);

  const app = await buildApi({
    workerId: 'mac-mini-m4',
    streams: ['q:light'],
    clientKeys: { n8n: 'z'.repeat(48) },
    nonces: createMemoryNonceStore(),
    activeJobs: () => 0,
  });
  await app.ready();
  await app.close();

  // process-warning calls process.emitWarning(message, name, code), e.g. 'FastifyDeprecation'.
  const deprecations = emitWarning.mock.calls.filter((args) =>
    args.some((arg) => typeof arg === 'string' && /Deprecation|^FSTDEP/.test(arg)),
  );
  expect(deprecations).toEqual([]);
});
