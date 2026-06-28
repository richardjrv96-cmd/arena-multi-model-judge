import type { Provider } from "@/lib/types";

/* Clean, monochrome brand marks — one per provider. They inherit `currentColor`
   so they stay within the monochrome palette and tint to accent when wanted.
   Drawn on a 24×24 viewBox. */

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONS: Record<Provider, React.ReactNode> = {
  // OpenAI — interlocked knot, simplified
  openai: (
    <Frame>
      <path d="M12 4a3.2 3.2 0 0 0-3 2.1 3.2 3.2 0 0 0-1.5 5.2 3.2 3.2 0 0 0 1.5 5.2 3.2 3.2 0 0 0 6 0 3.2 3.2 0 0 0 1.5-5.2 3.2 3.2 0 0 0-1.5-5.2A3.2 3.2 0 0 0 12 4Z" />
      <path d="M12 8.2v7.6M8.6 10.1l6.8 3.8M15.4 10.1l-6.8 3.8" strokeWidth={1} />
    </Frame>
  ),
  // Anthropic — the "A" burst
  anthropic: (
    <Frame>
      <path d="M7.5 18 12 6l4.5 12" />
      <path d="M9.4 13.6h5.2" />
    </Frame>
  ),
  // Google — chat-bubble "G"
  google: (
    <Frame>
      <path d="M15.5 9a4 4 0 1 0 .5 4H12" />
      <circle cx="12" cy="12" r="8.2" strokeWidth={1} />
    </Frame>
  ),
  // Meta — infinity loop
  meta: (
    <Frame>
      <path d="M4 12c2-4 5-4 8 0s6 4 8 0-2-4-4-2-3 4-4 2" />
    </Frame>
  ),
  // DeepSeek — diving arc / whale tail
  deepseek: (
    <Frame>
      <path d="M4 9c3 6 13 6 16 0" />
      <path d="M14 14c1.5 2 3.5 2 5 .5" />
      <circle cx="8.5" cy="8.5" r="0.6" fill="currentColor" />
    </Frame>
  ),
  // Qwen — interlinked diamonds
  qwen: (
    <Frame>
      <path d="M12 3 5 12l7 9 7-9-7-9Z" />
      <path d="M5 12h14" strokeWidth={1} />
    </Frame>
  ),
  // Mistral — stacked bars (wind)
  mistral: (
    <Frame>
      <path d="M5 8h14M5 12h14M5 16h14" />
      <path d="M9 4v16M15 4v16" strokeWidth={1} />
    </Frame>
  ),
  // xAI — the X
  xai: (
    <Frame>
      <path d="M6 6l12 12M18 6 6 18" />
    </Frame>
  ),
};

export function ModelIcon({
  provider,
  className = "",
}: {
  provider: Provider;
  className?: string;
}) {
  return <span className={className}>{ICONS[provider]}</span>;
}
