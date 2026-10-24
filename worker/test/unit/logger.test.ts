import { Writable } from 'node:stream';
import { describe, expect, test } from 'vitest';
import { createLogger, redactUrl } from '../../src/logger.js';

function capture(): { stream: Writable; output: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  return { stream, output: () => chunks.join('') };
}

describe('logger', () => {
  test('redacts secret fields at any depth', () => {
    const { stream, output } = capture();
    const logger = createLogger({ level: 'info', destination: stream });

    logger.info(
      {
        password: 'p@ss',
        headers: { authorization: 'Bearer abc', 'x-signature': 'sig' },
        provider: { apiKey: 'sk-123', token: 'tok' },
      },
      'request',
    );

    const text = output();
    for (const secret of ['p@ss', 'Bearer abc', 'sig"', 'sk-123', 'tok"']) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('[REDACTED]');
  });
});

describe('redactUrl', () => {
  test('removes credentials from connection strings', () => {
    expect(redactUrl('postgres://user:secret@db.local:5432/aivideo')).toBe(
      'postgres://user:***@db.local:5432/aivideo',
    );
  });

  test('removes secrets in query strings', () => {
    expect(redactUrl('https://api.example.com/v1?api_key=abc&voice=1')).toBe(
      'https://api.example.com/v1?api_key=***&voice=1',
    );
  });

  test('returns non-URLs unchanged', () => {
    expect(redactUrl('not a url')).toBe('not a url');
  });
});
