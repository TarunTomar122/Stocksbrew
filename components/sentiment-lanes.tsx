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
  if (l.includes("bull")) return { color: "#10b981", tone: "Bullish" };
  if (l.includes("bear")) return { color: "#ef4444", tone: "Bearish" };
  if (l.includes("caut")) return { color: "#ef4444", tone: "Cautious" };
  if (l.includes("mixed") || l.includes("neutral")) return { color: "#f59e0b", tone: "Mixed" };
  return { color: "var(--on-surface-variant)", tone: label || "-" };
}

function leanColor(lean: "bullish" | "bearish" | "neutral"): string {
  if (lean === "bullish") return "#10b981";
  if (lean === "bearish") return "#ef4444";
  return "#f59e0b";
}

export function SentimentLanes({ sentiment }: Props) {
  const score = sentiment?.overall_score ?? 0;
  const { color, tone } = labelTone(sentiment?.overall_label);
  const lanes = sentiment?.lanes ?? [];
  const sources = sentiment?.sources_breakdown ?? [];
  const totalArticles = sources.reduce((s, src) => s + src.article_count, 0);

  return (
    <section className="flex flex-col gap-5 pt-8 border-t border-outline-variant">
      <div className="flex flex-col gap-1">
        <h3 className="text-[18px] font-semibold text-on-surface tracking-[-0.01em]">
          Sentiment breakdown
        </h3>
        <p className="text-[12px] text-on-surface-variant leading-snug max-w-[640px]">
          A 0–100 score from averaging article sentiment across verified news,
          then split into two lanes so you can see what&apos;s driving it.
        </p>
      </div>

      <div className="flex items-baseline gap-3">
        <span className="text-[40px] font-semibold tracking-[-0.02em] text-on-surface tabular-nums leading-none">
          {Math.round(score)}
        </span>
        <span className="text-[12px] font-semibold tracking-[0.1em] uppercase" style={{ color }}>
          {tone}
        </span>
      </div>

      <div className="flex flex-col gap-4 max-w-[640px]">
        {lanes.length === 0 ? (
          <p className="text-[13px] text-on-surface-variant">No sentiment lanes yet.</p>
        ) : (
          lanes.map((lane) => {
            const pct = Math.max(0, Math.min(100, lane.positive_pct));
            const def = LANE_DEFINITIONS[lane.label];
            return (
              <div key={lane.label} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-semibold text-on-surface">
                    {lane.label}
                  </span>
                  <span className="text-[12px] font-semibold tabular-nums text-on-surface">
                    {pct.toFixed(0)}%
                  </span>
                </div>
                {def && (
                  <p className="text-[11px] text-on-surface-variant leading-snug">{def}</p>
                )}
                <div className="h-1.5 w-full rounded-full bg-surface-container overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#10b981]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {sources.length > 0 && (
        <details className="group max-w-[640px]">
          <summary className="cursor-pointer flex items-center justify-between text-[12px] font-semibold text-[#0052ff] hover:underline list-none">
            <span>
              Based on {totalArticles} article{totalArticles === 1 ? "" : "s"} across{" "}
              {sources.length} source{sources.length === 1 ? "" : "s"}
            </span>
            <span className="text-on-surface-variant group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <ul className="flex flex-col mt-3">
            {sources.map((src) => (
              <li
                key={src.source_name}
                className="flex items-center justify-between gap-3 text-[12px] py-2 border-t border-outline-variant first:border-t-0"
              >
                <span className="text-on-surface truncate flex-1">{src.source_name}</span>
                <span className="text-on-surface-variant tabular-nums shrink-0">
                  {src.article_count} article{src.article_count === 1 ? "" : "s"}
                </span>
                <span
                  className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] shrink-0"
                  style={{
                    color: leanColor(src.lean),
                    backgroundColor: `color-mix(in srgb, ${leanColor(src.lean)} 12%, transparent)`,
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
