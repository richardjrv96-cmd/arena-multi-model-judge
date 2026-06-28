import "server-only";

/* ───────────────────────────────────────────────────────────────────────────
   SERVER-ONLY OpenRouter helper.

   The `import "server-only"` above makes the build FAIL if this module is ever
   imported into a Client Component, guaranteeing the API key never ships to the
   browser. The key is read exclusively from process.env here.
─────────────────────────────────────────────────────────────────────────── */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Default output cap — keeps responses within what free lanes allow and
 *  avoids absurd requests (some clients/providers otherwise ask for 65536). */
export const DEFAULT_MAX_TOKENS = 2000;

/** Backoff schedule (ms) for automatic retries: ~1.5s, then ~3s. */
export const RETRY_BACKOFF_MS = [1500, 3000];

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CallOptions {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Ask the model to return a JSON object (used by judges). */
  jsonMode?: boolean;
  signal?: AbortSignal;
}

export class OpenRouterError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
  }
}

/**
 * Turn an OpenRouter error payload into a human-readable string.
 *
 * OpenRouter errors look like:
 *   { error: { code, message, metadata: { provider_name, raw } } }
 * and can arrive either as a non-200 body OR as a frame inside a 200 SSE
 * stream (e.g. the dreaded generic "Provider returned error"). This pulls out
 * the underlying provider name and raw upstream message so failures are
 * actually diagnosable instead of opaque.
 */
export function formatOpenRouterError(
  input: unknown,
  fallback = "Provider error",
): string {
  if (!input) return fallback;
  if (typeof input === "string") return input;

  const obj = input as Record<string, unknown>;
  // Accept either the error object itself or a wrapper { error: {...} }.
  const err = (obj.error ?? obj) as Record<string, unknown>;

  const message =
    (typeof err.message === "string" && err.message) || fallback;
  const code = err.code;
  const meta = err.metadata as Record<string, unknown> | undefined;

  let extra = "";
  if (meta?.provider_name) extra += ` [provider: ${meta.provider_name}]`;
  if (meta?.raw != null) {
    const raw =
      typeof meta.raw === "string" ? meta.raw : JSON.stringify(meta.raw);
    if (raw && raw !== message) extra += ` — ${raw.slice(0, 300)}`;
  }

  return `${message}${code != null ? ` (code ${code})` : ""}${extra}`;
}

/** Whether an error is worth retrying: rate limits (429) and transient
 *  upstream / network failures (>=500). Client errors (4xx) are not. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof OpenRouterError) {
    return err.status === 429 || err.status >= 500;
  }
  // Network-level failures (fetch throwing) — but never a deliberate abort.
  if (err instanceof DOMException && err.name === "AbortError") return false;
  return err instanceof Error && err.name === "TypeError"; // fetch network error
}

export function backoffDelay(attempt: number): number {
  return RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)];
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

/**
 * Run `fn`, retrying up to RETRY_BACKOFF_MS.length times on retryable errors
 * with the configured backoff. `onRetry` fires before each wait so callers can
 * surface a "retrying…" state. Re-throws the last error if all attempts fail.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    signal?: AbortSignal;
    onRetry?: (info: { attempt: number; of: number; delayMs: number; reason: string }) => void;
  } = {},
): Promise<T> {
  const maxRetries = RETRY_BACKOFF_MS.length;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxRetries || !isRetryable(err) || opts.signal?.aborted) {
        throw err;
      }
      const delayMs = backoffDelay(attempt);
      opts.onRetry?.({
        attempt: attempt + 1,
        of: maxRetries,
        delayMs,
        reason: err instanceof Error ? err.message : "transient error",
      });
      await sleep(delayMs, opts.signal);
    }
  }
  throw lastErr;
}

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    // 401 (not 5xx) so this config error is never treated as retryable.
    throw new OpenRouterError(
      "OPENROUTER_API_KEY is not set on the server. Add it to .env.local (local) or your Vercel project's Environment Variables.",
      401,
    );
  }
  return key;
}

/** Recommended OpenRouter attribution headers (optional but encouraged). */
function attribution(): Record<string, string> {
  const site =
    process.env.OPENROUTER_SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";
  return {
    "HTTP-Referer": site,
    "X-Title": "Arena",
  };
}

/**
 * Low-level call to OpenRouter's chat completions endpoint.
 * Returns the raw Response so callers can stream the body or read JSON.
 */
export async function callOpenRouter(opts: CallOptions): Promise<Response> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...attribution(),
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: opts.stream ?? false,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      detail = formatOpenRouterError(body, detail);
    } catch {
      // body wasn't JSON; keep the status line
    }
    throw new OpenRouterError(detail, res.status);
  }

  return res;
}

/** Non-streaming convenience: returns the assistant message text. */
export async function completeText(
  opts: Omit<CallOptions, "stream">,
): Promise<string> {
  const res = await callOpenRouter({ ...opts, stream: false });
  const data = await res.json();
  // OpenRouter can answer 200 with an embedded error and no choices.
  if (data?.error) {
    throw new OpenRouterError(formatOpenRouterError(data), 502);
  }
  return data?.choices?.[0]?.message?.content ?? "";
}
