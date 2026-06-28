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
      detail = body?.error?.message ?? body?.message ?? detail;
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
  return data?.choices?.[0]?.message?.content ?? "";
}
