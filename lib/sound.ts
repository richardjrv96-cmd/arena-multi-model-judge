import type { JudgeVerdict, SoundScore } from "./types";

/** Sum of the five S.O.U.N.D. dimensions for one answer → 0–50. */
export function soundTotal(s: SoundScore): number {
  return (
    s.substance + s.objectivity + s.usefulness + s.nuance + s.delivery
  );
}

/** Clamp a value into [0, 10] and coerce non-numbers to 0. */
export function clampScore(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, n));
}

export interface RankedAnswer {
  /** Anonymized label, e.g. "A". */
  label: string;
  /** Real model slug, revealed after judging. */
  slug: string;
  /** Mean S.O.U.N.D. dimensions averaged across all judges (each 0–10). */
  meanScores: SoundScore;
  /** Mean total across judges (0–50). */
  meanTotal: number;
  /** Per-judge totals for this answer (parallel to the judges array). */
  perJudgeTotal: number[];
  /** 1-based rank after sorting; ties share a rank. */
  rank: number;
  comments: { judgeSlug: string; comment: string }[];
}

export interface Leaderboard {
  ranked: RankedAnswer[];
  /** Winning answer (highest mean total), or null if no scores. */
  winner: RankedAnswer | null;
  /** 0–1, only meaningful with 2+ judges; null otherwise. */
  agreement: number | null;
  judgeSlugs: string[];
}

const ZERO: SoundScore = {
  substance: 0,
  objectivity: 0,
  usefulness: 0,
  nuance: 0,
  delivery: 0,
};

/**
 * Aggregate every judge's verdict into a leaderboard.
 *
 * @param verdicts  one entry per judge
 * @param labelToSlug  map from anonymized label ("A") → real model slug
 */
export function buildLeaderboard(
  verdicts: JudgeVerdict[],
  labelToSlug: Record<string, string>,
): Leaderboard {
  const judgeSlugs = verdicts.map((v) => v.judgeSlug);
  const labels = Object.keys(labelToSlug);

  const ranked: RankedAnswer[] = labels.map((label) => {
    const sum: SoundScore = { ...ZERO };
    const perJudgeTotal: number[] = [];
    const comments: { judgeSlug: string; comment: string }[] = [];
    let counted = 0;

    for (const v of verdicts) {
      const a = v.scores.find((s) => s.label === label);
      if (!a) {
        perJudgeTotal.push(0);
        continue;
      }
      sum.substance += a.scores.substance;
      sum.objectivity += a.scores.objectivity;
      sum.usefulness += a.scores.usefulness;
      sum.nuance += a.scores.nuance;
      sum.delivery += a.scores.delivery;
      perJudgeTotal.push(soundTotal(a.scores));
      if (a.comment) comments.push({ judgeSlug: v.judgeSlug, comment: a.comment });
      counted++;
    }

    const n = Math.max(1, counted);
    const meanScores: SoundScore = {
      substance: sum.substance / n,
      objectivity: sum.objectivity / n,
      usefulness: sum.usefulness / n,
      nuance: sum.nuance / n,
      delivery: sum.delivery / n,
    };

    return {
      label,
      slug: labelToSlug[label],
      meanScores,
      meanTotal: soundTotal(meanScores),
      perJudgeTotal,
      rank: 0,
      comments,
    };
  });

  // Sort by mean total, descending; assign ranks (ties share a rank).
  ranked.sort((a, b) => b.meanTotal - a.meanTotal);
  ranked.forEach((r, i) => {
    if (i > 0 && Math.abs(r.meanTotal - ranked[i - 1].meanTotal) < 1e-9) {
      r.rank = ranked[i - 1].rank;
    } else {
      r.rank = i + 1;
    }
  });

  const winner = ranked.length > 0 ? ranked[0] : null;
  const agreement = computeAgreement(verdicts, winner?.label);

  return { ranked, winner, agreement, judgeSlugs };
}

/**
 * Agreement = fraction of judges whose individual top pick matches the
 * consensus winner. Only meaningful with 2+ judges; returns null otherwise.
 */
function computeAgreement(
  verdicts: JudgeVerdict[],
  consensusLabel: string | undefined,
): number | null {
  if (verdicts.length < 2 || !consensusLabel) return null;

  let matches = 0;
  for (const v of verdicts) {
    let bestLabel: string | null = null;
    let bestTotal = -Infinity;
    for (const a of v.scores) {
      const t = soundTotal(a.scores);
      if (t > bestTotal) {
        bestTotal = t;
        bestLabel = a.label;
      }
    }
    if (bestLabel === consensusLabel) matches++;
  }
  return matches / verdicts.length;
}
