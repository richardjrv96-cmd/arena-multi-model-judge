"use client";

import { useRef, useEffect } from "react";

export function PromptBar({
  value,
  onChange,
  onSubmit,
  running,
  canSubmit,
  selectedCount,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  running: boolean;
  canSubmit: boolean;
  selectedCount: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
  }, [value]);

  function handleKey(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
  }

  return (
    <div className="rounded-xl border border-hairline bg-surface focus-within:border-hairline-strong transition-colors">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        rows={2}
        placeholder="Ask anything — every selected model answers in parallel…"
        className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[15px] leading-relaxed text-foreground placeholder:text-faint outline-none thin-scroll"
      />
      <div className="flex items-center justify-between px-3 pb-3 pt-1">
        <span className="text-xs text-faint">
          {selectedCount} model{selectedCount === 1 ? "" : "s"} selected
          <span className="mx-2 text-hairline-strong">·</span>
          <kbd className="font-mono text-[11px] text-muted">⌘↵</kbd> to run
        </span>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="group inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
        >
          {running ? "Running…" : "Compare"}
          {!running && (
            <span className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
