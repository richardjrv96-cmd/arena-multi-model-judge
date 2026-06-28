"use client";

import { MODELS, MAX_JUDGES } from "@/lib/models";
import { ModelIcon } from "./ModelIcon";

export function JudgePanel({
  selectedJudges,
  onToggleJudge,
  onJudge,
  judging,
  canJudge,
}: {
  selectedJudges: Set<string>;
  onToggleJudge: (slug: string) => void;
  onJudge: () => void;
  judging: boolean;
  canJudge: boolean;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-sm font-medium text-foreground">Blind judging</h2>
        <p className="text-xs text-faint">
          Responses are anonymized (A, B, C…). Pick up to {MAX_JUDGES} judges.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {MODELS.map((m) => {
          const active = selectedJudges.has(m.slug);
          const atLimit = !active && selectedJudges.size >= MAX_JUDGES;
          return (
            <button
              key={m.slug}
              type="button"
              onClick={() => onToggleJudge(m.slug)}
              disabled={judging || atLimit}
              aria-pressed={active}
              className={[
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                active
                  ? "border-accent/50 bg-accent-dim text-foreground"
                  : "border-hairline text-muted hover:border-hairline-strong hover:text-foreground",
              ].join(" ")}
            >
              <span className={`h-4 w-4 ${active ? "text-accent" : "text-faint"}`}>
                <ModelIcon provider={m.provider} />
              </span>
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={onJudge}
          disabled={!canJudge || judging}
          className="inline-flex items-center gap-2 rounded-lg border border-accent/50 bg-accent-dim px-4 py-2 text-sm font-medium text-accent transition-opacity hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-30"
        >
          {judging ? "Judging…" : "Judge blind"}
        </button>
        <span className="text-xs text-faint">
          {selectedJudges.size} judge{selectedJudges.size === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
