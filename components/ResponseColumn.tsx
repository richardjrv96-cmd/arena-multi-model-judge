"use client";

import { useEffect, useRef } from "react";
import type { Model } from "@/lib/types";
import { ModelIcon } from "./ModelIcon";

export type RunStatus = "pending" | "streaming" | "done" | "error";

export interface Run {
  text: string;
  status: RunStatus;
  error?: string;
}

export interface ColumnVerdict {
  rank: number;
  meanTotal: number;
  isWinner: boolean;
}

export function ResponseColumn({
  model,
  run,
  verdict,
}: {
  model: Model;
  run: Run;
  verdict?: ColumnVerdict;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Keep the latest tokens in view while streaming.
  useEffect(() => {
    if (run.status === "streaming" && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [run.text, run.status]);

  return (
    <div
      className={[
        "flex h-full min-w-[300px] flex-col rounded-xl border bg-surface transition-colors",
        verdict?.isWinner ? "border-accent/60" : "border-hairline",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={[
              "h-4 w-4 shrink-0",
              verdict?.isWinner ? "text-accent" : "text-muted",
            ].join(" ")}
          >
            <ModelIcon provider={model.provider} />
          </span>
          <span className="truncate text-sm font-medium text-foreground">
            {model.label}
          </span>
          {model.tier === "free" && (
            <span className="rounded-full bg-hairline px-1.5 py-px text-[10px] uppercase tracking-wide text-faint">
              free
            </span>
          )}
        </div>
        {verdict && (
          <div className="flex shrink-0 items-center gap-2">
            {verdict.isWinner && (
              <span className="rounded-full bg-accent-dim px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                Winner
              </span>
            )}
            <span className="font-mono text-xs text-muted">
              #{verdict.rank} · {verdict.meanTotal.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div
        ref={bodyRef}
        className="thin-scroll flex-1 overflow-y-auto px-4 py-3.5 text-[14px] leading-relaxed text-foreground/90"
      >
        {run.status === "error" ? (
          <p className="text-sm text-red-400">{run.error ?? "Something went wrong."}</p>
        ) : run.text ? (
          <p className={`whitespace-pre-wrap ${run.status === "streaming" ? "caret" : ""}`}>
            {run.text}
          </p>
        ) : run.status === "streaming" || run.status === "pending" ? (
          <ThinkingDots />
        ) : (
          <p className="text-sm text-faint">No response.</p>
        )}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 text-faint">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
    </span>
  );
}
