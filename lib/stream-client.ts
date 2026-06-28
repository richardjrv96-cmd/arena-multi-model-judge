// Client-side helper to consume the SSE stream from /api/chat.
// (No "server-only" here — this runs in the browser. It never touches the API key.)

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

/** POST a prompt for one model and pump its streamed deltas into the handlers. */
export async function streamChat(
  slug: string,
  prompt: string,
  handlers: StreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, prompt }),
      signal,
    });
  } catch (e) {
    if (signal.aborted) return;
    handlers.onError(e instanceof Error ? e.message : "Network error.");
    return;
  }

  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status}).`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    handlers.onError(msg);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "" ) continue;
        if (payload === "[DONE]") {
          handlers.onDone();
          return;
        }
        try {
          const json = JSON.parse(payload);
          if (json.error) {
            handlers.onError(json.error);
            return;
          }
          if (json.delta) handlers.onDelta(json.delta);
        } catch {
          /* ignore keep-alives / partial frames */
        }
      }
    }
    handlers.onDone();
  } catch (e) {
    if (signal.aborted) return;
    handlers.onError(e instanceof Error ? e.message : "Stream interrupted.");
  }
}

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A, B, C, … Z, AA, AB … */
export function labelFor(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}
