import "server-only";

/* ───────────────────────────────────────────────────────────────────────────
   SERVER-ONLY OpenRouter helper.

   The `import "server-only"` above makes the build FAIL if this module is ever
   imported into a Client Component, guaranteeing the API key never ships to the
   browser. The key is read exclusively from process.env here.
─────────────────────────────────────────────────────────────────────────── */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CallOptions {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
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

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new OpenRouterError(
      "OPENROUTER_API_KEY is not set on the server. Add it to .env.local (local) or your Vercel project's Environment Variables.",
      500,
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
