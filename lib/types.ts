// Shared types used across client and server.

export type Tier = "free" | "premium";

export type Provider =
  | "openai"
  | "anthropic"
  | "google"
  | "meta"
  | "deepseek"
  | "qwen"
  | "mistral"
  | "xai"
  | "nvidia";

export interface Model {
  /** OpenRouter model id, e.g. "openai/gpt-4o" or "google/gemini-2.0-flash-exp:free". */
  slug: string;
  /** Short human label shown in the UI, e.g. "GPT-4o". */
  label: string;
  /** Provider key — drives the brand icon. */
  provider: Provider;
  tier: Tier;
  /** Pre-selected when the app loads. */
  defaultSelected?: boolean;
  /** Pre-selected as a judge when the app loads. */
  defaultJudge?: boolean;
}

/** The five rubric dimensions, each scored 0–10. */
export interface RubricScore {
  accuracy: number;
  reasoning: number;
  completeness: number;
  clarity: number;
  safety: number;
}

export const RUBRIC_DIMENSIONS = [
  { key: "accuracy", short: "Acc", label: "Accuracy" },
  { key: "reasoning", short: "Rea", label: "Reasoning" },
  { key: "completeness", short: "Cmp", label: "Completeness" },
  { key: "clarity", short: "Clr", label: "Clarity" },
  { key: "safety", short: "Saf", label: "Safety" },
] as const;

/** One judge's score for one anonymized answer. */
export interface AnswerScore {
  /** Anonymized label: "A", "B", "C", ... */
  label: string;
  scores: RubricScore;
  /** Optional one-line rationale from the judge. */
  comment?: string;
}

/** A full verdict returned by a single judge. */
export interface JudgeVerdict {
  judgeSlug: string;
  scores: AnswerScore[];
}
