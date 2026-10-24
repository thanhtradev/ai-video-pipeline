import pino, { type DestinationStream, type Logger } from 'pino';

export type { Logger };

// Field names whose values must never reach logs (docs/security.md §1).
const SECRET_FIELDS = [
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'authorization',
  'x-signature',
  'cookie',
  'key',
];

// Redact the field at the top level and up to two levels deep.
function redactPaths(field: string): string[] {
  const isIdentifier = /^[A-Za-z_$][\w$]*$/.test(field);
  const own = isIdentifier ? field : `["${field}"]`;
  const nested = isIdentifier ? `.${field}` : own;
  return [own, `*${nested}`, `*.*${nested}`];
}

const REDACT_PATHS = SECRET_FIELDS.flatMap(redactPaths);

const SECRET_QUERY_PARAMS =
  /^(api[_-]?key|key|token|access[_-]?token|secret|password|sig|signature)$/i;

export interface LoggerOptions {
  level: string;
  destination?: DestinationStream;
}

export function createLogger(options: LoggerOptions): Logger {
  return pino(
    {
      level: options.level,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      base: null,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    options.destination,
  );
}

/** Strips passwords and secret query parameters from a URL for safe logging. */
export function redactUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (url.password) url.password = '***';
  for (const name of [...url.searchParams.keys()]) {
    if (SECRET_QUERY_PARAMS.test(name)) url.searchParams.set(name, '***');
  }
  return url.toString().replaceAll('%2A%2A%2A', '***');
}
