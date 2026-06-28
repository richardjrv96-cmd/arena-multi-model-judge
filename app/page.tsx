"use client";

import { useMemo, useRef, useState } from "react";
import { MODELS, getModel, DEFAULT_SELECTED, DEFAULT_JUDGES } from "@/lib/models";
import { buildLeaderboard, type Leaderboard as LeaderboardData } from "@/lib/rubric";
import type { JudgeVerdict } from "@/lib/types";
import { streamChat, shuffle, labelFor } from "@/lib/stream-client";
import { PromptBar } from "@/components/PromptBar";
import { ModelPicker } from "@/components/ModelPicker";
import { ResponseColumn, type Run, type ColumnVerdict } from "@/components/ResponseColumn";
import { JudgePanel } from "@/components/JudgePanel";
import { Leaderboard } from "@/components/Leaderboard";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(DEFAULT_SELECTED),
  );
  const [order, setOrder] = useState<string[]>([]);
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [running, setRunning] = useState(false);

  const [judges, setJudges] = useState<Set<string>>(
    () => new Set(DEFAULT_JUDGES),
  );
  const [judging, setJudging] = useState(false);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [board, setBoard] = useState<LeaderboardData | null>(null);

  const chatAbort = useRef<AbortController | null>(null);
  const judgeAbort = useRef<AbortController | null>(null);

  const hasCompared = order.length > 0;

  // ── Selection ────────────────────────────────────────────────────────────
  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function toggleJudge(slug: string) {
    setJudges((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  // ── Compare ──────────────────────────────────────────────────────────────
  async function runCompare() {
    const slugs = MODELS.filter((m) => selected.has(m.slug)).map((m) => m.slug);
    if (slugs.length === 0 || !prompt.trim()) return;

    // Reset any prior run / judging.
    chatAbort.current?.abort();
    judgeAbort.current?.abort();
    const controller = new AbortController();
    chatAbort.current = controller;

    setBoard(null);
    setJudgeError(null);
    setSubmittedPrompt(prompt);
    setOrder(slugs);
    setRuns(
      Object.fromEntries(
        slugs.map((s) => [s, { text: "", status: "pending" } as Run]),
      ),
    );
    setRunning(true);

    const update = (slug: string, fn: (r: Run) => Run) =>
      setRuns((prev) => ({
        ...prev,
        [slug]: fn(prev[slug] ?? { text: "", status: "pending" }),
      }));

    // Fire every model in parallel; each column streams independently.
    await Promise.all(
      slugs.map((slug) =>
        streamChat(
          slug,
          prompt,
          {
            onDelta: (t) =>
              update(slug, (r) => ({
                ...r,
                status: "streaming",
                retry: undefined,
                text: r.text + t,
              })),
            onRetry: (info) =>
              update(slug, (r) => ({
                ...r,
                status: "retrying",
                retry: { attempt: info.attempt, of: info.of },
              })),
            onError: (msg) =>
              update(slug, (r) => ({ ...r, status: "error", error: msg })),
            onDone: () =>
              update(slug, (r) => ({
                ...r,
                status: r.status === "error" ? "error" : "done",
              })),
          },
          controller.signal,
        ),
      ),
    );

    setRunning(false);
  }

  // ── Judge ────────────────────────────────────────────────────────────────
  // Answers eligible for judging: completed with non-empty text.
  const eligible = useMemo(
    () => order.filter((s) => runs[s]?.status === "done" && runs[s]?.text.trim()),
    [order, runs],
  );

  const canJudge =
    !running && eligible.length >= 2 && judges.size >= 1 && !judging;

  async function runJudge() {
    if (!canJudge) return;

    judgeAbort.current?.abort();
    const controller = new AbortController();
    judgeAbort.current = controller;

    setJudging(true);
    setJudgeError(null);
    setBoard(null);

    // Anonymize: shuffle eligible answers and label them A, B, C…
    const shuffled = shuffle(eligible);
    const labelToSlug: Record<string, string> = {};
    const answers = shuffled.map((slug, i) => {
      const label = labelFor(i);
      labelToSlug[label] = slug;
      return { label, text: runs[slug].text };
    });

    const judgeSlugs = MODELS.filter((m) => judges.has(m.slug)).map(
      (m) => m.slug,
    );

    const results = await Promise.all(
      judgeSlugs.map(
        async (judgeSlug): Promise<JudgeVerdict | { error: string }> => {
          try {
            const res = await fetch("/api/judge", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                judgeSlug,
                prompt: submittedPrompt,
                answers,
              }),
              signal: controller.signal,
            });
            const json = await res.json();
            if (!res.ok) return { error: json?.error ?? "Judge failed." };
            return json as JudgeVerdict;
          } catch (e) {
            if (controller.signal.aborted) return { error: "aborted" };
            return { error: e instanceof Error ? e.message : "Judge failed." };
          }
        },
      ),
    );

    if (controller.signal.aborted) return;

    const verdicts = results.filter((r): r is JudgeVerdict => "scores" in r);
    const errors = results.filter((r): r is { error: string } => "error" in r);

    if (verdicts.length === 0) {
      setJudgeError(errors[0]?.error ?? "All judges failed.");
      setJudging(false);
      return;
    }
    if (errors.length > 0) {
      setJudgeError(`${errors.length} judge(s) failed; showing the rest.`);
    }

    setBoard(buildLeaderboard(verdicts, labelToSlug));
    setJudging(false);
  }

  // Per-column verdict badges for highlighting winners.
  const columnVerdicts = useMemo(() => {
    const map: Record<string, ColumnVerdict> = {};
    if (board) {
      for (const r of board.ranked) {
        map[r.slug] = {
          rank: r.rank,
          meanTotal: r.meanTotal,
          isWinner: r.rank === 1,
        };
      }
    }
    return map;
  }, [board]);

  const gridStyle = {
    gridTemplateColumns: `repeat(${Math.max(order.length, 1)}, minmax(300px, 1fr))`,
  };

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-5 sm:px-8">
      {/* Header */}
      <header className="flex items-center justify-between py-7">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-accent/40 text-accent">
            <span className="h-4 w-4">
              <ArenaMark />
            </span>
          </span>
          <h1 className="text-lg font-semibold tracking-tight">Arena</h1>
          <span className="hidden text-sm text-faint sm:inline">
            multi-model comparator
          </span>
        </div>
        <a
          href="https://openrouter.ai/models"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-faint transition-colors hover:text-muted"
        >
          via OpenRouter ↗
        </a>
      </header>

      {/* Composer */}
      <section className="space-y-5">
        <PromptBar
          value={prompt}
          onChange={setPrompt}
          onSubmit={runCompare}
          running={running}
          canSubmit={!running && prompt.trim().length > 0 && selected.size > 0}
          selectedCount={selected.size}
        />
        <ModelPicker selected={selected} onToggle={toggle} disabled={running} />
      </section>

      {/* Columns */}
      {hasCompared && (
        <section className="mt-9">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 className="text-xs uppercase tracking-widest text-faint">
              Responses
            </h2>
            <p className="max-w-[60%] truncate text-xs text-faint">
              “{submittedPrompt}”
            </p>
          </div>
          <div className="thin-scroll overflow-x-auto pb-2">
            <div className="grid h-[min(60vh,640px)] gap-4" style={gridStyle}>
              {order.map((slug) => {
                const model = getModel(slug)!;
                return (
                  <ResponseColumn
                    key={slug}
                    model={model}
                    run={runs[slug] ?? { text: "", status: "pending" }}
                    verdict={columnVerdicts[slug]}
                  />
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Judging */}
      {hasCompared && (
        <section className="mt-9 space-y-5 pb-16">
          <JudgePanel
            selectedJudges={judges}
            onToggleJudge={toggleJudge}
            onJudge={runJudge}
            judging={judging}
            canJudge={canJudge}
          />
          {!canJudge && eligible.length < 2 && !running && (
            <p className="text-xs text-faint">
              Need at least 2 completed responses to run a blind comparison.
            </p>
          )}
          {judgeError && <p className="text-xs text-red-400">{judgeError}</p>}
          {board && <Leaderboard data={board} />}
        </section>
      )}

      {!hasCompared && (
        <div className="mt-16 flex flex-1 items-center justify-center pb-20">
          <p className="max-w-md text-center text-sm leading-relaxed text-faint">
            Write a prompt, pick a few models, and watch them answer side by side
            in real time. Then let a panel of blind judges score them on a{" "}
            <span className="text-muted">standard</span> rubric.
          </p>
        </div>
      )}
    </div>
  );
}

function ArenaMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      <path d="M4 18 L9 6 L12 13 L15 6 L20 18" />
    </svg>
  );
}
