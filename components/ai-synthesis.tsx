import type { StockIntelligenceDoc } from "@/lib/stock";

type Props = {
  intelligence: StockIntelligenceDoc | null;
};

function sentimentMeta(label: string): { dot: string; chipBg: string; chipFg: string } {
  const v = (label ?? "").toLowerCase();
  if (v === "bullish")
    return { dot: "#10b981", chipBg: "color-mix(in srgb, var(--signal-bullish) 14%, var(--surface))", chipFg: "#10b981" };
  if (v === "bearish")
    return { dot: "#ef4444", chipBg: "color-mix(in srgb, var(--signal-bearish) 14%, var(--surface))", chipFg: "#ef4444" };
  if (v === "mixed")
    return { dot: "#f59e0b", chipBg: "color-mix(in srgb, var(--signal-neutral) 16%, var(--surface))", chipFg: "#f59e0b" };
  return { dot: "var(--on-surface-variant)", chipBg: "var(--surface-container)", chipFg: "var(--on-surface)" };
}

function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, "").trim();
}

export function AiSynthesis({ intelligence }: Props) {
  const sentimentLabel = intelligence?.overall_label ?? "neutral";
  const sentimentScore =
    typeof intelligence?.overall_score === "number"
      ? Math.round(intelligence.overall_score)
      : null;
  const meta = sentimentMeta(sentimentLabel);

  const overview =
    (intelligence?.body ? stripHtml(intelligence.body) : null) ||
    (intelligence?.today_brief ? stripHtml(intelligence.today_brief) : null) ||
    (intelligence?.thesis ? stripHtml(intelligence.thesis) : null) ||
    "No significant news events captured in the last run.";

  const paragraphs = overview.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: meta.dot }}
              aria-hidden
            />
            <h3 className="text-[18px] font-semibold text-on-surface tracking-[-0.01em]">
              News overview
            </h3>
          </div>
          <p className="text-[12px] text-on-surface-variant max-w-[520px]">
            What&apos;s happening with this stock right now - synthesised from
            recent coverage, not a buy/sell recommendation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sentimentScore !== null && (
            <span className="text-[28px] font-semibold tabular-nums text-on-surface leading-none">
              {sentimentScore}
            </span>
          )}
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase"
            style={{ background: meta.chipBg, color: meta.chipFg }}
          >
            {sentimentLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-[15px] text-on-surface leading-[1.6]">
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}
