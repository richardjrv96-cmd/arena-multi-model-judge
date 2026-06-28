"use client";

import { MODELS } from "@/lib/models";
import type { Model } from "@/lib/types";
import { ModelIcon } from "./ModelIcon";

function Chip({
  model,
  active,
  disabled,
  onToggle,
}: {
  model: Model;
  active: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={active}
      className={[
        "group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-accent/50 bg-accent-dim text-foreground"
          : "border-hairline text-muted hover:border-hairline-strong hover:text-foreground",
      ].join(" ")}
    >
      <span
        className={[
          "h-4 w-4 shrink-0",
          active ? "text-accent" : "text-faint group-hover:text-muted",
        ].join(" ")}
      >
        <ModelIcon provider={model.provider} />
      </span>
      {model.label}
      {model.tier === "free" && (
        <span
          className={[
            "rounded-full px-1.5 py-px text-[10px] font-medium uppercase tracking-wide",
            active ? "bg-accent/20 text-accent" : "bg-hairline text-faint",
          ].join(" ")}
        >
          free
        </span>
      )}
    </button>
  );
}

export function ModelPicker({
  selected,
  onToggle,
  disabled,
}: {
  selected: Set<string>;
  onToggle: (slug: string) => void;
  disabled: boolean;
}) {
  const free = MODELS.filter((m) => m.tier === "free");
  const premium = MODELS.filter((m) => m.tier === "premium");

  return (
    <div className="space-y-4">
      <Group label="Free">
        {free.map((m) => (
          <Chip
            key={m.slug}
            model={m}
            active={selected.has(m.slug)}
            disabled={disabled}
            onToggle={() => onToggle(m.slug)}
          />
        ))}
      </Group>
      <Group label="Premium">
        {premium.map((m) => (
          <Chip
            key={m.slug}
            model={m}
            active={selected.has(m.slug)}
            disabled={disabled}
            onToggle={() => onToggle(m.slug)}
          />
        ))}
      </Group>
    </div>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-16 shrink-0 pt-2 text-xs uppercase tracking-widest text-faint">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
