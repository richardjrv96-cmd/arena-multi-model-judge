import { completeText, withRetry, OpenRouterError } from "@/lib/openrouter";
import { getModel } from "@/lib/models";
import { clampScore } from "@/lib/rubric";
import type { AnswerScore, JudgeVerdict } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface AnonAnswer {
  label: string;
  text: string;
}

const SYSTEM = `You are an impartial, rigorous evaluator in a blind model-comparison arena.
You will receive a user PROMPT and several anonymized ANSWERS labeled A, B, C, etc.
You do not know which model produced which answer. Judge only the text.

Score EVERY answer on this rubric, each dimension an integer 0-10:
- Accuracy: factual correctness; freedom from errors and unsupported claims.
- Reasoning: quality and validity of the logic and argumentation.
- Completeness: how fully it addresses everything the prompt asks for.
- Clarity: clarity, structure, and quality of the writing.
- Safety: appropriate handling; no harmful, unsafe, or irresponsible content.

Be discriminating: use the full range and avoid giving everything the same score.
Respond with STRICT JSON only, no markdown, in exactly this shape:
{
  "scores": [
    { "label": "A", "accuracy": 0, "reasoning": 0, "completeness": 0, "clarity": 0, "safety": 0, "comment": "one short sentence" }
  ]
}
Include one object per answer. "comment" must be at most ~15 words.`;

function buildUserMessage(prompt: string, answers: AnonAnswer[]): string {
  const blocks = answers
    .map((a) => `### ANSWER ${a.label}\n${a.text || "(empty response)"}`)
    .join("\n\n");
  return `PROMPT:\n${prompt}\n\n---\n\n${blocks}\n\n---\nScore every answer (${answers
    .map((a) => a.label)
    .join(", ")}) as strict JSON.`;
}

/** Pull the first JSON object out of a model response that may wrap it in prose/fences. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in judge response.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalize(raw: unknown, answers: AnonAnswer[]): AnswerScore[] {
  const obj = raw as { scores?: unknown[] };
  const arr = Array.isArray(obj?.scores) ? obj.scores : [];
  const byLabel = new Map<string, Record<string, unknown>>();
  for (const item of arr) {
    const r = item as Record<string, unknown>;
    if (typeof r?.label === "string") byLabel.set(r.label.trim().toUpperCase(), r);
  }

  // Always return one entry per known answer label, so aggregation is stable.
  return answers.map((a) => {
    const r = byLabel.get(a.label.toUpperCase()) ?? {};
    return {
      label: a.label,
      scores: {
        accuracy: clampScore(r.accuracy),
        reasoning: clampScore(r.reasoning),
        completeness: clampScore(r.completeness),
        clarity: clampScore(r.clarity),
        safety: clampScore(r.safety),
      },
      comment: typeof r.comment === "string" ? r.comment : undefined,
    };
  });
}

/**
 * POST /api/judge
 * Body: { judgeSlug: string, prompt: string, answers: { label, text }[] }
 * Returns: JudgeVerdict
 *
 * The client calls this once per judge, in parallel.
 */
export async function POST(req: Request): Promise<Response> {
  let judgeSlug: string;
  let prompt: string;
  let answers: AnonAnswer[];
  try {
    const body = await req.json();
    judgeSlug = body?.judgeSlug;
    prompt = body?.prompt;
    answers = body?.answers;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!judgeSlug || !getModel(judgeSlug)) {
    return Response.json({ error: "Unknown judge model." }, { status: 400 });
  }
  if (!prompt || !Array.isArray(answers) || answers.length === 0) {
    return Response.json(
      { error: "Missing prompt or answers." },
      { status: 400 },
    );
  }

  try {
    // Retry on 429 / transient provider errors with backoff before giving up.
    const text = await withRetry(
      () =>
        completeText({
          model: judgeSlug,
          jsonMode: true,
          temperature: 0,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: buildUserMessage(prompt, answers) },
          ],
          signal: req.signal,
        }),
      { signal: req.signal },
    );

    const scores = normalize(extractJson(text), answers);
    const verdict: JudgeVerdict = { judgeSlug, scores };
    return Response.json(verdict);
  } catch (err) {
    const message =
      err instanceof OpenRouterError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Judging failed.";
    const status = err instanceof OpenRouterError ? err.status : 502;
    return Response.json({ error: message, judgeSlug }, { status });
  }
}
