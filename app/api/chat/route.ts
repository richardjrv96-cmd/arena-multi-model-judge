import {
  callOpenRouter,
  formatOpenRouterError,
  OpenRouterError,
} from "@/lib/openrouter";
import { getModel } from "@/lib/models";

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
 *   data: {"error":"...message..."}
 *   data: [DONE]
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
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
        let streamErrored = false;

        // Parse OpenRouter's SSE stream and re-emit only the text deltas.
        // Note: OpenRouter often returns HTTP 200 and then reports provider
        // failures as an error frame *inside* the stream — detect those.
        outer: while (true) {
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
            try {
              const json = JSON.parse(payload);
              if (json.error) {
                controller.enqueue(
                  send({ error: formatOpenRouterError(json.error) }),
                );
                streamErrored = true;
                break outer;
              }
              const delta = json?.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(send({ delta }));
            } catch {
              // OpenRouter sends ": OPENROUTER PROCESSING" keep-alives etc. — ignore.
            }
          }
        }

        if (!streamErrored) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        }
      } catch (err) {
        const message =
          err instanceof OpenRouterError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Streaming failed.";
        // Don't surface an abort (client navigated away / cancelled) as an error.
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          controller.enqueue(send({ error: message }));
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
