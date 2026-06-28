import type { Model } from "./types";

/* ───────────────────────────────────────────────────────────────────────────
   MODEL REGISTRY — this is the one place to edit which models appear in Arena.

   To add a model:
     1. Find its exact id on https://openrouter.ai/models  (e.g. "openai/gpt-4o").
     2. Add an entry below with that `slug`, a short `label`, a `provider`
        (drives the brand icon — see lib/types.ts Provider + components/ModelIcon),
        and a `tier` ("free" or "premium").
     3. Optionally set `defaultSelected` (pre-ticked for comparison) and/or
        `defaultJudge` (pre-ticked as a judge).

   "free" models carry the ":free" suffix and cost nothing on OpenRouter.
   "premium" models use the SAME OpenRouter API key but are billed per token.

   NOTE: OpenRouter's free catalog changes often. The free entries below were
   valid when this was written; if one stops working, swap its slug for a
   current ":free" id from the link above. Examples that were NOT available as
   free at build time but you can add if/when OpenRouter offers them:
     // { slug: "google/gemini-2.0-flash-exp:free", label: "Gemini Flash", provider: "google", tier: "free" },
     // { slug: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3", provider: "deepseek", tier: "free" },
─────────────────────────────────────────────────────────────────────────── */

export const MODELS: Model[] = [
  // ── Free tier (no cost) ──────────────────────────────────────────────────
  // NOTE: a slug being present in OpenRouter's catalog does NOT guarantee its
  // free endpoint is serving — large free models are frequently rate-limited or
  // have "no available provider instances", which surfaces as a provider error.
  // The models below were chosen for healthier free endpoints; if one starts
  // failing, the in-app error now shows the real reason and you can swap it for
  // another ":free" id from https://openrouter.ai/models
  // Stable picks first (pre-selected). The heaviest/most popular free models
  // (e.g. Nemotron Super 120B, Qwen3 Coder 480B) saturate fastest and 429 most,
  // so we favor smaller / lighter-active variants here. Automatic retries on the
  // server (see lib/openrouter withRetry) smooth over transient rate limits.
  // Other low-traffic free options you can swap in if needed (need new icons):
  //   cohere/north-mini-code:free · liquid/lfm-2.5-1.2b-instruct:free
  {
    slug: "openai/gpt-oss-120b:free",
    label: "GPT-OSS 120B",
    provider: "openai",
    tier: "free",
    defaultSelected: true,
    defaultJudge: true,
  },
  {
    slug: "openai/gpt-oss-20b:free",
    label: "GPT-OSS 20B",
    provider: "openai",
    tier: "free",
    defaultSelected: true,
  },
  {
    slug: "meta-llama/llama-3.2-3b-instruct:free",
    label: "Llama 3.2 3B",
    provider: "meta",
    tier: "free",
    defaultSelected: true,
  },
  {
    slug: "nvidia/nemotron-nano-9b-v2:free",
    label: "Nemotron Nano 9B",
    provider: "nvidia",
    tier: "free",
  },
  {
    slug: "qwen/qwen3-next-80b-a3b-instruct:free",
    label: "Qwen3 Next 80B",
    provider: "qwen",
    tier: "free",
  },
  {
    slug: "google/gemma-4-26b-a4b-it:free",
    label: "Gemma 4 26B",
    provider: "google",
    tier: "free",
  },

  // ── Premium tier (same API key, billed per token) ────────────────────────
  {
    slug: "openai/gpt-4o",
    label: "GPT-4o",
    provider: "openai",
    tier: "premium",
  },
  {
    slug: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    tier: "premium",
    defaultJudge: true,
  },
  {
    slug: "x-ai/grok-4.20",
    label: "Grok 4.20",
    provider: "xai",
    tier: "premium",
  },
  {
    slug: "deepseek/deepseek-chat-v3.1",
    label: "DeepSeek V3.1",
    provider: "deepseek",
    tier: "premium",
  },
  {
    slug: "mistralai/mistral-small-3.2-24b-instruct",
    label: "Mistral Small 3.2",
    provider: "mistral",
    tier: "premium",
  },
];

const BY_SLUG: Map<string, Model> = new Map(MODELS.map((m) => [m.slug, m]));

/** Look up a model by its OpenRouter slug. */
export function getModel(slug: string): Model | undefined {
  return BY_SLUG.get(slug);
}

/** Short label for a slug, falling back to the slug itself. */
export function modelLabel(slug: string): string {
  return BY_SLUG.get(slug)?.label ?? slug;
}

export const DEFAULT_SELECTED = MODELS.filter((m) => m.defaultSelected).map(
  (m) => m.slug,
);

export const DEFAULT_JUDGES = MODELS.filter((m) => m.defaultJudge).map(
  (m) => m.slug,
);

/** Max judges allowed in the blind panel. */
export const MAX_JUDGES = 3;
