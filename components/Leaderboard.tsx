"use client";

import { useState } from "react";
import type { Leaderboard as LeaderboardData, RankedAnswer } from "@/lib/sound";
import { SOUND_DIMENSIONS } from "@/lib/types";
import { getModel, modelLabel } from "@/lib/models";
import { ModelIcon } from "./ModelIcon";

export function Leaderboard({ data }: { data: LeaderboardData }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-medium text-foreground">Leaderboard</h2>
          <span className="text-xs text-faint">
            {data.judgeSlugs.length} judge
            {data.judgeSlugs.length === 1 ? "" : "s"} ·{" "}
            {data.judgeSlugs.map((s) => modelLabel(s)).join(", ")}
          </span>
        </div>
        {data.agreement !== null && (
          <Agreement value={data.agreement} />
        )}
      </div>

      <ol className="divide-y divide-hairline">
        {data.ranked.map((r) => (
          <Row key={r.label} answer={r} judgeSlugs={data.judgeSlugs} />
        ))}
      </ol>
    </div>
  );
}

function Agreement({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2" title="Share of judges whose top pick matches the consensus winner">
      <span className="text-xs uppercase tracking-widest text-faint">
        Agreement
      </span>
      <span className="font-mono text-sm text-foreground">{pct}%</span>
      <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-hairline">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}

function Row({
  answer,
  judgeSlugs,
}: {
  answer: RankedAnswer;
  judgeSlugs: string[];
}) {
  const [open, setOpen] = useState(false);
  const model = getModel(answer.slug);
  const isWinner = answer.rank === 1;

  return (
    <li
      className={[
        "px-5 py-4 transition-colors",
        isWinner ? "bg-accent-dim" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-4">
        <span
          className={[
            "w-6 shrink-0 text-center font-mono text-sm",
            isWinner ? "text-accent" : "text-faint",
          ].join(" ")}
        >
          {answer.rank}
        </span>

        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-hairline-strong font-mono text-xs text-muted">
          {answer.label}
        </span>

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {model && (
            <span className={`h-4 w-4 ${isWinner ? "text-accent" : "text-muted"}`}>
              <ModelIcon provider={model.provider} />
            </span>
          )}
          <span className="truncate text-sm font-medium text-foreground">
            {modelLabel(answer.slug)}
          </span>
          {isWinner && (
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
              Winner
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-baseline gap-1.5">
          <span className="font-mono text-base text-foreground">
            {answer.meanTotal.toFixed(1)}
          </span>
          <span className="text-xs text-faint">/ 50</span>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-xs text-faint transition-colors hover:text-muted"
          aria-expanded={open}
        >
          {open ? "Hide" : "Details"}
        </button>
      </div>

      {/* S.O.U.N.D. breakdown bars */}
      <div className="mt-3 grid grid-cols-5 gap-2 pl-10">
        {SOUND_DIMENSIONS.map((d) => {
          const v = answer.meanScores[d.key];
          return (
            <div key={d.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between">
                <span
                  className="font-mono text-[11px] text-faint"
                  title={d.label}
                >
                  {d.letter}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  {v.toFixed(1)}
                </span>
              </div>
              <span className="relative h-1 overflow-hidden rounded-full bg-hairline">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-foreground/50"
                  style={{ width: `${(v / 10) * 100}%` }}
                />
              </span>
            </div>
          );
        })}
      </div>

      {open && (
        <div className="mt-4 space-y-2 pl-10">
          {answer.comments.length === 0 && (
            <p className="text-xs text-faint">No comments from judges.</p>
          )}
          {answer.comments.map((c, i) => (
            <p key={i} className="text-xs leading-relaxed text-muted">
              <span className="text-faint">{modelLabel(c.judgeSlug)}:</span>{" "}
              {c.comment}
            </p>
          ))}
          <p className="pt-1 font-mono text-[11px] text-faint">
            per-judge totals:{" "}
            {answer.perJudgeTotal
              .map((t, i) => `${modelLabel(judgeSlugs[i])} ${t.toFixed(0)}`)
              .join("  ·  ")}
          </p>
        </div>
      )}
    </li>
  );
}
