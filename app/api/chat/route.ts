import {
  callOpenRouter,
  formatOpenRouterError,
  isRetryable,
  backoffDelay,
  RETRY_BACKOFF_MS,
  OpenRouterError,
} from "@/lib/openrouter";
import { getModel } from "@/lib/models";

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, {
      once: true,
    });
  });

/** Outcome of a single connect-and-stream attempt. */
type Attempt =
  | { kind: "complete" }
  | { kind: "retry"; reason: string }
  | { kind: "error"; message: string };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/chat
 * Body: { slug: string, prompt: string }
 *
 * Streams a single model's completion back to the browser as Server-Sent
 * Events. One request == one model; the client opens several of these in
 * parallel (one per column) so the columns stream independently.
 *
 * SSE events emitted:
 *   data: {"delta":"...token..."}
 *   data: {"retry":{"attempt":1,"of":2,"reason":"..."}}
 *   data: {"error":"...message..."}
 *   data: [DONE]
 *
 * Retries: if a model fails (429 / transient provider error) BEFORE any token
 * has been streamed, the request is retried with backoff (~1.5s, ~3s) and a
 * "retry" event is emitted so the column can show "retrying…". Once tokens have
 * started flowing we never retry (that would duplicate output) — a later error
 * is surfaced as-is. After all attempts fail, the real error is shown.
 *
 * The OpenRouter API key is read server-side inside lib/openrouter and never
 * leaves this process.
 */
export async function POST(req: Request) {
  let slug: string;
  let prompt: string;
  try {
    const body = await req.json();
    slug = body?.slug;
    prompt = body?.prompt;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!slug || typeof slug !== "string") {
    return Response.json({ error: "Missing 'slug'." }, { status: 400 });
  }
  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "Missing 'prompt'." }, { status: 400 });
  }
  if (!getModel(slug)) {
    return Response.json(
      { error: `Unknown model '${slug}'.` },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const send = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  // One connect-and-stream attempt. Emits delta events directly; reports back
  // whether it completed, can be retried (no tokens sent yet), or hard-failed.
  async function runAttempt(
    controller: ReadableStreamDefaultController<Uint8Array>,
  ): Promise<Attempt> {
    let committed = false; // have we emitted at least one token?
    try {
      const upstream = await callOpenRouter({
        model: slug,
        stream: true,
        messages: [{ role: "user", content: prompt }],
        signal: req.signal,
      });

      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep the trailing partial line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "" || payload === "[DONE]") continue;
          let json: { error?: unknown; choices?: { delta?: { content?: string } }[] };
          try {
            json = JSON.parse(payload);
          } catch {
            continue; // keep-alives / partial frames
          }
          if (json.error) {
            // OpenRouter returns 200 then an error frame for provider failures.
            const message = formatOpenRouterError(json.error);
            if (committed) return { kind: "error", message };
            // No tokens yet → eligible for retry.
            const code = (json.error as { code?: number })?.code;
            const retryable = code == null || code === 429 || code >= 500;
            return retryable
              ? { kind: "retry", reason: message }
              : { kind: "error", message };
          }
          const delta = json?.choices?.[0]?.delta?.content;
          if (delta) {
            committed = true;
            controller.enqueue(send({ delta }));
          }
        }
      }
      return { kind: "complete" };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { kind: "complete" }; // client cancelled; nothing to report
      }
      const message =
        err instanceof OpenRouterError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Streaming failed.";
      // A connect/transport failure with no tokens sent yet may be retried.
      if (!committed && isRetryable(err)) return { kind: "retry", reason: message };
      return { kind: "error", message };
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const maxAttempts = RETRY_BACKOFF_MS.length; // retries after the first try
      try {
        for (let attempt = 0; ; attempt++) {
          const outcome = await runAttempt(controller);

          if (outcome.kind === "complete") {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            break;
          }
          if (outcome.kind === "error") {
            controller.enqueue(send({ error: outcome.message }));
            break;
          }
          // outcome.kind === "retry"
          if (attempt >= maxAttempts || req.signal.aborted) {
            controller.enqueue(send({ error: outcome.reason }));
            break;
          }
          controller.enqueue(
            send({
              retry: {
                attempt: attempt + 1,
                of: maxAttempts,
                reason: outcome.reason,
              },
            }),
          );
          await sleep(backoffDelay(attempt), req.signal);
          if (req.signal.aborted) break;
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
