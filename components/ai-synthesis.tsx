import type { StockIntelligenceDoc } from "@/lib/stock";
import type { TimelineEvent } from "@/lib/stock";

type Props = {
  intelligence: StockIntelligenceDoc | null;
  timeline?: TimelineEvent[] | null;
};

function sentimentMeta(label: string): { dot: string; tone: string; chipBg: string; chipFg: string } {
  const v = (label ?? "").toLowerCase();
  if (v === "bullish")
    return { dot: "#10b981", tone: "text-[#10b981]", chipBg: "#ecfdf5", chipFg: "#065f46" };
  if (v === "bearish")
    return { dot: "#ef4444", tone: "text-[#ef4444]", chipBg: "#fef2f2", chipFg: "#991b1b" };
  if (v === "mixed")
    return { dot: "#f59e0b", tone: "text-[#b45309]", chipBg: "#fef3c7", chipFg: "#92400e" };
  return { dot: "#9ca3af", tone: "text-[#6b7280]", chipBg: "#f3f4f6", chipFg: "#374151" };
}

function SynthesisBlock({
  emoji,
  iconBg,
  eyebrow,
  body,
}: {
  emoji: string;
  iconBg: string;
  eyebrow: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-3 p-5 lg:p-6">
      <div className="flex items-center gap-3">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[18px]"
          style={{ background: iconBg }}
          aria-hidden
        >
          {emoji}
        </span>
        <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">
          {eyebrow}
        </span>
      </div>
      <p className="text-[15px] text-[#111111] leading-[1.6]">{body}</p>
    </div>
  );
}

function visualSummaryHasCards(vs: StockIntelligenceDoc["visual_summary"]): boolean {
  const w = String(vs?.what_changed ?? "").trim();
  const y = String(vs?.why_it_matters ?? "").trim();
  const t = String(vs?.what_to_watch ?? "").trim();
  return Boolean(w || y || t);
}

function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, "").trim();
}

function formatRelative(iso?: string): string {
  if (!iso) return "not refreshed yet";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function AiSynthesis({ intelligence, timeline }: Props) {
  const vs = intelligence?.visual_summary;
  const sentimentLabel = intelligence?.overall_label ?? "neutral";
  const sentimentScore =
    typeof intelligence?.overall_score === "number"
      ? Math.round(intelligence.overall_score)
      : null;
  const meta = sentimentMeta(sentimentLabel);

  const newestNewsTitle = (timeline ?? [])
    .filter((event) => {
      const source = String(event.source_name ?? "").toLowerCase();
      const title = String(event.title ?? "").toLowerCase();
      if (source.includes("scheduled market snapshot")) return false;
      if (title.includes("price snapshot captured")) return false;
      return Boolean(String(event.title ?? "").trim());
    })
    .sort((a, b) => Date.parse(String(b.timestamp ?? "")) - Date.parse(String(a.timestamp ?? "")))[0]?.title;

  const whatChanged =
    (vs?.what_changed ? stripHtml(vs.what_changed) : null) ||
    (newestNewsTitle ? stripHtml(newestNewsTitle) : null) ||
    (intelligence?.today_brief ? stripHtml(intelligence.today_brief) : null) ||
    "No significant news events captured in the last run.";
  const whyItMatters =
    (vs?.why_it_matters ? stripHtml(vs.why_it_matters) : null) ||
    (intelligence?.thesis ? stripHtml(intelligence.thesis) : null) ||
    "Context will appear once the pipeline synthesizes coverage.";
  const whatToWatch =
    (vs?.what_to_watch ? stripHtml(vs.what_to_watch) : null) ||
    (intelligence?.catalyst ? stripHtml(intelligence.catalyst) : null) ||
    "No catalysts flagged yet - check back after the next pipeline run.";

  const hasBriefText = Boolean(
    intelligence &&
      (String(intelligence.headline ?? "").trim() ||
        String(intelligence.body ?? "").trim() ||
        String(intelligence.today_brief ?? "").trim() ||
        String(intelligence.thesis ?? "").trim()),
  );
  const cardsPending = Boolean(intelligence && !visualSummaryHasCards(vs) && hasBriefText);

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
            <h3 className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
              News signal
            </h3>
            {cardsPending && (
              <span
                className="inline-flex items-center rounded-md bg-[#f3f4f6] text-[#6b7280] px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase"
                title="Brief text is live; the three-card layout fills in when the pipeline includes visual_summary."
              >
                Cards pending
              </span>
            )}
          </div>
          <p className="text-[12px] text-[#6b7280] max-w-[520px]">
            Synthesised from recent articles &amp; analyst reports - not a buy/sell
            recommendation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sentimentScore !== null && (
            <span className="text-[28px] font-semibold tabular-nums text-[#111111] leading-none">
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

      <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden divide-y divide-[#f3f4f6]">
        <SynthesisBlock
          emoji="📰"
          iconBg="#eff6ff"
          eyebrow="What the news is saying"
          body={whatChanged}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-[#f3f4f6] divide-y md:divide-y-0">
          <SynthesisBlock
            emoji="🎯"
            iconBg="#fef3c7"
            eyebrow="Why it matters for the stock"
            body={whyItMatters}
          />
          <SynthesisBlock
            emoji="🔭"
            iconBg="#ecfdf5"
            eyebrow="Watch for next"
            body={whatToWatch}
          />
        </div>
      </div>
    </section>
  );
}
