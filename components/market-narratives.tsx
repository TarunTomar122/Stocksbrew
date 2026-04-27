import Link from "next/link";

import { resolveSectorId, type SectorSlugMap } from "@/lib/sector";
import type { HeroBrief, MarketContextBlock } from "@/lib/types";

type Props = {
  context?: MarketContextBlock | null;
  heroBrief?: HeroBrief | null;
  sectorSlugMap?: SectorSlugMap;
};

function toneForLabel(label?: string): { color: string; chipBg: string; softBg: string } {
  const l = (label ?? "").toLowerCase();
  if (l.includes("construct") || l.includes("bull") || l.includes("risk-on")) {
    return {
      color: "var(--signal-bullish)",
      chipBg: "bg-signal-bullish/15",
      softBg: "bg-signal-bullish/5",
    };
  }
  if (l.includes("bear") || l.includes("risk-off") || l.includes("stress")) {
    return {
      color: "var(--signal-bearish)",
      chipBg: "bg-signal-bearish/15",
      softBg: "bg-signal-bearish/5",
    };
  }
  return {
    color: "var(--signal-neutral)",
    chipBg: "bg-signal-neutral/20",
    softBg: "bg-signal-neutral/5",
  };
}

function formatRelative(iso?: string): string {
  if (!iso) return "recently";
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

function SectorChips({
  label,
  sectors,
  tone,
  sectorSlugMap,
}: {
  label: string;
  sectors: string[];
  tone: "bullish" | "bearish";
  sectorSlugMap?: SectorSlugMap;
}) {
  if (!sectors.length) return null;
  const color = tone === "bullish" ? "var(--signal-bullish)" : "var(--signal-bearish)";
  const bg = tone === "bullish" ? "bg-signal-bullish/15" : "bg-signal-bearish/15";
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold text-on-surface-variant">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {sectors.map((s) => {
          const id = sectorSlugMap ? resolveSectorId(s, sectorSlugMap) : null;
          const baseClass = `px-2.5 py-1 text-[11px] font-semibold rounded-sm ${bg}`;
          return id ? (
            <Link
              key={s}
              href={`/sector/${encodeURIComponent(id)}`}
              className={`${baseClass} transition-transform hover:-translate-y-0.5`}
              style={{ color }}
            >
              {s}
            </Link>
          ) : (
            <span key={s} className={baseClass} style={{ color }}>
              {s}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ContextCard({
  label,
  body,
  accent,
}: {
  label: string;
  body: string;
  accent: string;
}) {
  return (
    <div className="flex flex-col gap-2 p-5 bg-surface-container-low brutalist-border">
      <span
        className="text-[11px] font-semibold"
        style={{ color: accent }}
      >
        {label}
      </span>
      <p className="text-[14px] text-on-surface leading-relaxed">{body}</p>
    </div>
  );
}

export function MarketNarratives({ context, heroBrief, sectorSlugMap }: Props) {
  if (!context && !heroBrief) return null;

  const today_label = context?.today_label;
  const today_score = context?.today_score;
  const today_brief = context?.today_brief ?? heroBrief?.body;
  const today_key_points = context?.today_key_points ?? [];
  const week_label = context?.week_label;
  const week_score = context?.week_score;
  const week_brief = context?.week_brief;
  const leading_sectors = context?.leading_sectors ?? [];
  const lagging_sectors = context?.lagging_sectors ?? [];
  const visual_summary = context?.visual_summary;
  const article_count = context?.article_count ?? heroBrief?.verified_source_count;

  const tone = toneForLabel(today_label);
  const weekTone = toneForLabel(week_label);
  const hasVisualSummary =
    visual_summary &&
    (visual_summary.what_changed ||
      visual_summary.what_to_watch ||
      visual_summary.why_it_matters);
  const hasWeek = week_brief || week_label || typeof week_score === "number";

  return (
    <section className="bg-surface-container-lowest brutalist-border p-8 md:p-10 flex flex-col gap-8">
      {/* Header: label + tone pill */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span
              className="w-2 h-2 animate-pulse"
              style={{ backgroundColor: tone.color }}
              aria-hidden="true"
            />
            <h3 className="text-[12px] font-semibold tracking-wide uppercase text-on-surface-variant">
              Market Briefing · Today
            </h3>
          </div>
          {today_label && (
            <span
              className={`px-3 py-1 text-[11px] font-semibold tracking-wide uppercase rounded-sm ${tone.chipBg}`}
              style={{ color: tone.color }}
            >
              {today_label}
            </span>
          )}
        </div>
        <p className="text-[11px] text-on-surface-variant leading-snug">
          A 0–100 read on today's market tone, blending sentiment from verified
          news. Higher = broadly positive, lower = broadly negative.
        </p>
      </div>

      {/* Hero: score + sentence */}
      <div className="flex items-start gap-6 flex-wrap">
        {typeof today_score === "number" && (
          <div className="flex items-baseline gap-1.5 flex-shrink-0">
            <span
              className="text-[44px] md:text-[52px] font-bold tracking-[-0.03em] tabular-nums leading-none"
              style={{ color: tone.color }}
            >
              {Math.round(today_score)}
            </span>
            <span className="text-[12px] font-semibold text-on-surface-variant">
              / 100
            </span>
          </div>
        )}
        {today_brief && (
          <p className="text-[20px] md:text-[24px] leading-snug text-on-surface font-medium tracking-[-0.01em] flex-1 min-w-[320px] max-w-[68ch] pt-1">
            {today_brief}
          </p>
        )}
      </div>


      {/* Sector chips */}
      {(leading_sectors.length > 0 || lagging_sectors.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <SectorChips label="Leading sectors" sectors={leading_sectors} tone="bullish" sectorSlugMap={sectorSlugMap} />
          <SectorChips label="Lagging sectors" sectors={lagging_sectors} tone="bearish" sectorSlugMap={sectorSlugMap} />
        </div>
      )}

      {/* Context cards */}
      {hasVisualSummary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {visual_summary?.what_changed && (
            <ContextCard
              label="What changed"
              body={visual_summary.what_changed}
              accent="var(--primary)"
            />
          )}
          {visual_summary?.why_it_matters && (
            <ContextCard
              label="Why it matters"
              body={visual_summary.why_it_matters}
              accent="var(--signal-bullish)"
            />
          )}
          {visual_summary?.what_to_watch && (
            <ContextCard
              label="What to watch"
              body={visual_summary.what_to_watch}
              accent="var(--signal-neutral)"
            />
          )}
        </div>
      )}

      {/* This week */}
      {hasWeek && (
        <div className={`flex flex-col gap-3 p-6 brutalist-border ${weekTone.softBg}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] font-semibold tracking-wide uppercase text-on-surface-variant">
              This week
            </span>
            {week_label && (
              <span
                className={`px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-sm ${weekTone.chipBg}`}
                style={{ color: weekTone.color }}
              >
                {week_label}
              </span>
            )}
            {typeof week_score === "number" && (
              <span
                className="text-[12px] font-bold tabular-nums"
                style={{ color: weekTone.color }}
              >
                {Math.round(week_score)} / 100
              </span>
            )}
          </div>
          {week_brief && (
            <p className="text-[14px] text-on-surface leading-relaxed max-w-[68ch]">
              {week_brief}
            </p>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[11px] text-on-surface-variant pt-2">
        <span>
          {typeof article_count === "number"
            ? `${article_count} verified sources`
            : "Synthesized briefing"}
        </span>
        {(context?.generated_at || heroBrief?.updated_at) && (
          <span>
            Updated {formatRelative(context?.generated_at ?? heroBrief?.updated_at)}
          </span>
        )}
      </div>
    </section>
  );
}
