import { z } from 'zod';
import { PermanentJobError, ProviderBlockedError } from '../runner.js';

// ITERA TTS public API (D-040, docs/infrastructure.md S-24): asynchronous text to speech.
// POST /v1/text-to-speech/{voice_id} queues a task; GET /v1/history/{id} reports it; the audio is
// an MP3 at result.audio_url. Errors are classified for the runner (docs/job-lifecycle.md §6):
// key/credit/rate problems block the job, server and network errors are retried, other client
// errors are permanent. The API key is sent only to the API origin and never logged.

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_ERROR_BODY_CHARS = 300;
const DEFAULT_RATE_LIMIT_SECONDS = 60;

export interface SpeechRequest {
  voiceId: string;
  text: string;
  modelId: string;
  provider: string;
  languageCode: string;
  voiceSettings?: Record<string, unknown>;
}

const taskSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  result: z.object({ audio_url: z.string().optional() }).nullish(),
  error: z.string().nullish(),
  characters_used: z.number().nonnegative().nullish(),
  credits_deducted: z.number().nonnegative().nullish(),
});

export interface IteraTask {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  audioUrl: string | undefined;
  error: string | undefined;
  charactersUsed: number | undefined;
  creditsDeducted: number | undefined;
}

export interface IteraClient {
  /** Queues a task and returns its id. */
  createSpeech: (request: SpeechRequest, signal: AbortSignal) => Promise<string>;
  getTask: (taskId: string, signal: AbortSignal) => Promise<IteraTask>;
  creditBalance: (signal: AbortSignal) => Promise<number>;
  download: (url: string, signal: AbortSignal) => Promise<Uint8Array>;
}

export interface IteraClientOptions {
  baseUrl: string;
  apiKey: string;
  /** How long a job waits after a key, credit, or quota refusal before it is retried. */
  blockSeconds: number;
  requestTimeoutMs: number;
  fetch?: typeof fetch;
}

function retryAfterSeconds(response: Response): number {
  const value = Number(response.headers.get('retry-after'));
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RATE_LIMIT_SECONDS;
}

async function failure(response: Response, what: string, blockSeconds: number): Promise<Error> {
  const body = (await response.text().catch(() => '')).slice(0, MAX_ERROR_BODY_CHARS);
  const message = `ITERA ${what}: HTTP ${response.status} ${body}`.trim();
  if (response.status === 401 || response.status === 403) {
    return new ProviderBlockedError(`${message} (check the API key)`, blockSeconds);
  }
  if (response.status === 402) return new ProviderBlockedError(message, blockSeconds);
  if (response.status === 429)
    return new ProviderBlockedError(message, retryAfterSeconds(response));
  if (response.status >= 500) return new Error(message);
  return new PermanentJobError(message);
}

export function createIteraClient(options: IteraClientOptions): IteraClient {
  const fetchImpl = options.fetch ?? fetch;
  const origin = new URL(options.baseUrl).origin;

  async function call(
    url: string,
    init: RequestInit,
    what: string,
    signal: AbortSignal,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (new URL(url).origin === origin) headers.set('xi-api-key', options.apiKey);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...init,
        headers,
        signal: AbortSignal.any([signal, AbortSignal.timeout(options.requestTimeoutMs)]),
      });
    } catch (error: unknown) {
      if (signal.aborted) throw error;
      throw new Error(`ITERA ${what} failed: ${error instanceof Error ? error.message : error}`);
    }
    if (!response.ok) throw await failure(response, what, options.blockSeconds);
    return response;
  }

  async function json<T>(response: Response, schema: z.ZodType<T>, what: string): Promise<T> {
    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) throw new Error(`ITERA ${what}: unexpected response`);
    return parsed.data;
  }

  return {
    createSpeech: async (request, signal) => {
      const url = `${origin}/v1/text-to-speech/${encodeURIComponent(request.voiceId)}`;
      const body = {
        text: request.text,
        model_id: request.modelId,
        provider: request.provider,
        language_code: request.languageCode,
        ...(request.voiceSettings ? { voice_settings: request.voiceSettings } : {}),
      };
      const response = await call(
        url,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
        'text-to-speech',
        signal,
      );
      return (await json(response, z.object({ id: z.string().min(1) }), 'text-to-speech')).id;
    },

    getTask: async (taskId, signal) => {
      const url = `${origin}/v1/history/${encodeURIComponent(taskId)}`;
      const task = await json(await call(url, {}, 'history', signal), taskSchema, 'history');
      return {
        id: task.id,
        status: task.status,
        audioUrl: task.result?.audio_url,
        error: task.error ?? undefined,
        charactersUsed: task.characters_used ?? undefined,
        creditsDeducted: task.credits_deducted ?? undefined,
      };
    },

    creditBalance: async (signal) => {
      const response = await call(`${origin}/v1/auth/me`, {}, 'me', signal);
      return (await json(response, z.object({ credit_balance: z.number() }), 'me')).credit_balance;
    },

    download: async (url, signal) => {
      if (!/^https?:\/\//.test(url)) throw new Error('ITERA audio url is not http(s)');
      const response = await call(url, {}, 'audio download', signal);
      const declared = Number(response.headers.get('content-length'));
      if (declared > MAX_AUDIO_BYTES) throw new PermanentJobError('ITERA audio is too large');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0) throw new Error('ITERA audio download is empty');
      if (bytes.length > MAX_AUDIO_BYTES) throw new PermanentJobError('ITERA audio is too large');
      return bytes;
    },
  };
}
