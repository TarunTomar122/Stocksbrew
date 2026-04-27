import type { SentimentBreakdown } from "@/lib/stock";

type Props = {
  sentiment: SentimentBreakdown | null | undefined;
};

const LANE_DEFINITIONS: Record<string, string> = {
  "Positive Mentions":
    "Share of stock mentions across articles that leaned positive.",
  "Source Agreement":
    "Share of distinct sources whose articles lean bullish on average.",
};

function labelTone(label?: string): { color: string; tone: string } {
  const l = (label ?? "").toLowerCase();
  if (l.includes("bull"))
    return { color: "var(--signal-bullish)", tone: "Bullish" };
  if (l.includes("bear"))
    return { color: "var(--signal-bearish)", tone: "Bearish" };
  if (l.includes("caut"))
    return { color: "var(--signal-bearish)", tone: "Cautious" };
  if (l.includes("mixed") || l.includes("neutral"))
    return { color: "var(--signal-neutral)", tone: "Mixed" };
  return { color: "var(--outline)", tone: label || "—" };
}

function leanColor(lean: "bullish" | "bearish" | "neutral"): string {
  if (lean === "bullish") return "var(--signal-bullish)";
  if (lean === "bearish") return "var(--signal-bearish)";
  return "var(--signal-neutral)";
}

export function SentimentLanes({ sentiment }: Props) {
  const score = sentiment?.overall_score ?? 0;
  const { color, tone } = labelTone(sentiment?.overall_label);
  const lanes = sentiment?.lanes ?? [];
  const sources = sentiment?.sources_breakdown ?? [];
  const totalArticles = sources.reduce((s, src) => s + src.article_count, 0);

  return (
    <section className="bg-surface-container-lowest brutalist-border p-6 h-full flex flex-col">
      <h2 className="text-[14px] font-semibold text-on-surface">
        Sentiment Breakdown
      </h2>
      <p className="text-[11px] text-on-surface-variant leading-snug mt-1 mb-4">
        A 0–100 score from averaging article sentiment across verified news, then
        split into two lanes so you can see what's driving it.
      </p>

      <div className="flex items-baseline gap-3 mb-5">
        <span className="text-[40px] font-bold tracking-[-0.02em] text-on-surface tabular-nums leading-none">
          {Math.round(score)}
        </span>
        <span
          className="text-[12px] font-bold tracking-[0.15em] uppercase"
          style={{ color }}
        >
          {tone}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {lanes.length === 0 ? (
          <div className="text-[13px] text-on-surface-variant py-4">
            No sentiment lanes yet.
          </div>
        ) : (
          lanes.map((lane) => {
            const pct = Math.max(0, Math.min(100, lane.positive_pct));
            const def = LANE_DEFINITIONS[lane.label];
            return (
              <div key={lane.label}>
                <div className="flex justify-between items-baseline mb-0.5 gap-3">
                  <span className="text-[11px] font-semibold text-on-surface">
                    {lane.label}
                  </span>
                  <span className="text-[11px] font-bold text-on-surface tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                </div>
                {def && (
                  <p className="text-[10px] text-on-surface-variant leading-snug mb-1.5">
                    {def}
                  </p>
                )}
                <div className="w-full h-1.5 bg-surface-container-high">
                  <div
                    className="h-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: "var(--signal-bullish)",
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {sources.length > 0 && (
        <details className="mt-5 pt-4 border-t border-outline/20 group">
          <summary className="cursor-pointer text-[11px] font-semibold text-on-surface-variant hover:text-on-surface flex items-center justify-between list-none">
            <span>
              Based on {totalArticles} article{totalArticles === 1 ? "" : "s"} across{" "}
              {sources.length} source{sources.length === 1 ? "" : "s"}
            </span>
            <span className="text-on-surface-variant group-open:rotate-180 transition-transform">
              ▾
            </span>
          </summary>
          <ul className="flex flex-col gap-1.5 mt-3">
            {sources.map((src) => (
              <li
                key={src.source_name}
                className="flex items-center justify-between gap-3 text-[11px]"
              >
                <span className="text-on-surface truncate flex-1">
                  {src.source_name}
                </span>
                <span className="text-on-surface-variant tabular-nums flex-shrink-0">
                  {src.article_count} article{src.article_count === 1 ? "" : "s"}
                </span>
                <span
                  className="px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase rounded-sm flex-shrink-0"
                  style={{
                    color: leanColor(src.lean),
                    backgroundColor: `color-mix(in srgb, ${leanColor(src.lean)} 15%, transparent)`,
                  }}
                >
                  {src.lean}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
