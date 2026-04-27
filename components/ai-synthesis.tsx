import type { StockIntelligenceDoc } from "@/lib/stock";

type Props = {
  intelligence: StockIntelligenceDoc | null;
  mocked?: boolean;
};

function sentimentStyle(label: string): {
  dot: string;
  text: string;
  bg: string;
  badge: string;
} {
  const v = (label ?? "").toLowerCase();
  if (v === "bullish")
    return {
      dot: "bg-signal-bullish",
      text: "text-signal-bullish",
      bg: "border-l-signal-bullish",
      badge: "bg-signal-bullish/15 text-signal-bullish",
    };
  if (v === "bearish")
    return {
      dot: "bg-signal-bearish",
      text: "text-signal-bearish",
      bg: "border-l-signal-bearish",
      badge: "bg-signal-bearish/15 text-signal-bearish",
    };
  if (v === "mixed")
    return {
      dot: "bg-signal-neutral",
      text: "text-on-surface",
      bg: "border-l-signal-neutral",
      badge: "bg-signal-neutral/20 text-on-surface",
    };
  return {
    dot: "bg-outline",
    text: "text-on-surface-variant",
    bg: "border-l-outline-variant",
    badge: "bg-surface-container text-on-surface-variant",
  };
}

function Block({
  eyebrow,
  body,
}: {
  eyebrow: string;
  body: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-outline mb-1.5">
        {eyebrow}
      </div>
      <p className="text-[14px] leading-relaxed text-on-surface-variant">{body}</p>
    </div>
  );
}

export function AiSynthesis({ intelligence, mocked }: Props) {
  const vs = intelligence?.visual_summary ?? {};
  const sentimentLabel = intelligence?.overall_label ?? "neutral";
  const sentimentScore =
    typeof intelligence?.overall_score === "number"
      ? Math.round(intelligence.overall_score)
      : null;

  const style = sentimentStyle(sentimentLabel);

  const whatChanged =
    vs.what_changed ||
    intelligence?.today_brief ||
    "No significant news events captured in the last run.";
  const whyItMatters =
    vs.why_it_matters ||
    intelligence?.thesis ||
    "Context will appear once the pipeline synthesizes coverage.";
  const whatToWatch =
    vs.what_to_watch ||
    intelligence?.catalyst ||
    "No catalysts flagged yet — check back after the next pipeline run.";

  return (
    <section
      className={`bg-surface-container-lowest brutalist-border p-6 relative border-l-4 ${style.bg}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} />
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-on-surface-variant">
              News Signal
            </span>
            {mocked && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold tracking-[0.15em] uppercase bg-signal-neutral/25 text-on-surface rounded-sm">
                Mock
              </span>
            )}
          </div>
          <p className="text-[12px] text-on-surface-variant">
            Synthesised from recent articles & analyst reports — not a buy/sell
            recommendation.
          </p>
        </div>

        {/* Sentiment badge + score */}
        <div className="flex items-center gap-2 shrink-0">
          {sentimentScore !== null && (
            <span className="text-[28px] font-bold tabular-nums text-on-surface leading-none">
              {sentimentScore}
            </span>
          )}
          <span
            className={`px-2.5 py-1 text-[11px] font-bold tracking-[0.12em] uppercase rounded-full ${style.badge}`}
          >
            {sentimentLabel}
          </span>
        </div>
      </div>

      {/* Three signal blocks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        <Block eyebrow="What the news is saying" body={whatChanged} />
        <Block eyebrow="Why it matters for the stock" body={whyItMatters} />
        <Block eyebrow="Watch for next" body={whatToWatch} />
      </div>
    </section>
  );
}
