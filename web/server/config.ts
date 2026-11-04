import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  WEB_PUBLIC_ORIGIN: z.url({ protocol: /^https?$/ }).regex(/^https?:\/\/[^/]+$/),
  WEB_HOST: z.string().default('127.0.0.1'),
  WEB_PORT: z.coerce.number().int().min(1).max(65_535).default(8790),
  WEB_UI_DIR: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type WebConfig = z.infer<typeof envSchema>;

/** Names the invalid variables only; a value may be a secret. */
export function loadConfig(env: NodeJS.ProcessEnv): WebConfig {
  const parsed = envSchema.safeParse(env);
  if (parsed.success) return parsed.data;
  const names = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`invalid web console configuration: ${names}`);
}
