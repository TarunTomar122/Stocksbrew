import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SectorConstituentsStream } from "@/components/sector-constituents-stream";
import { SectorConstituentsSkeleton } from "@/components/page-stream-skeletons";
import { getSectorContextDoc, getTrackedSectorMembers } from "@/lib/sector";
import { getCurrentMarket } from "@/lib/market";

export const revalidate = 60;

type Props = {
  params: Promise<{ id: string }>;
};

function sectorMetaDescription(label: string, source?: string): string {
  const brief = source?.replace(/\s+/g, " ").trim() ?? "";
  if (brief.length >= 80) return brief.slice(0, 155).trim();
  return `${brief ? `${brief} ` : ""}Follow ${label} stocks, sector momentum, and the drivers worth watching.`.slice(0, 155);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const market = getCurrentMarket();
  let doc = await getSectorContextDoc(id, market).catch(() => null);
  if (!doc) {
    try { doc = await getSectorContextDoc(id, market === "US" ? "IN" : "US").catch(() => null); } catch {}
  }
  const label = doc?.sector_label ?? id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const brief = sectorMetaDescription(label, doc?.today_brief);
  return {
    title: `${label} - Sector Brief`,
    description: brief,
    alternates: { canonical: `/sector/${id}` },
    openGraph: {
      title: `${label} - Sector Brief · stocksbrew`,
      description: brief,
      url: `https://www.stocksbrew.online/sector/${id}`,
    },
    twitter: {
      title: `${label} - Sector Brief · stocksbrew`,
      description: brief,
    },
  };
}

function toneForLabel(label?: string): { color: string; chipBg: string; softBg: string } {
  const l = (label ?? "").toLowerCase();
  if (l.includes("construct") || l.includes("bull") || l.includes("risk-on")) {
    return {
      color: "var(--signal-bullish)",
      chipBg: "bg-signal-bullish/15",
      softBg: "bg-signal-bullish/5",
    };
  }
  if (l.includes("bear") || l.includes("risk-off") || l.includes("stress") || l.includes("cautious")) {
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

function titleizeSector(input: string): string {
  return input
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
      <span className="text-[11px] font-semibold" style={{ color: accent }}>
        {label}
      </span>
      <p className="text-[14px] text-on-surface leading-relaxed">{body}</p>
    </div>
  );
}

export default async function SectorPage({ params }: Props) {
  const { id } = await params;
  const market = getCurrentMarket();
  const sectorId = decodeURIComponent(id).toLowerCase();
  const trackedMembers = getTrackedSectorMembers(sectorId, market);
  const doc = await getSectorContextDoc(sectorId, market);
  if (!doc && trackedMembers.length === 0) notFound();

  const sectorLabel = doc?.sector_label ?? titleizeSector(sectorId);
  const tone = toneForLabel(doc?.today_label);
  const weekTone = toneForLabel(doc?.week_label);
  const visual = doc?.visual_summary ?? {
    what_changed: doc?.what_changed,
    why_it_matters: doc?.why_it_matters,
    what_to_watch: doc?.what_to_watch,
  };
  const hasVisual =
    !!(visual.what_changed || visual.why_it_matters || visual.what_to_watch);
  const hasWeek =
    !!(doc?.week_brief || doc?.week_label || typeof doc?.week_score === "number");

  const trackedTickers = trackedMembers.map((row) => row.ticker);
  const fallbackTickers = (doc?.distinct_tickers ?? []).map((t) => String(t).toUpperCase());
  const tickers = (trackedTickers.length > 0 ? trackedTickers : fallbackTickers).slice(0, 40);
  const heroBrief = doc?.today_brief ?? null;

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-12 flex flex-col gap-8">
        <nav className="text-[11px] text-on-surface-variant">
          <Link href="/" className="hover:text-on-surface">
            Markets
          </Link>
          <span className="px-2">/</span>
          <span className="text-on-surface">{sectorLabel}</span>
        </nav>

        <section className="bg-surface-container-lowest brutalist-border p-8 md:p-10 flex flex-col gap-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span
                className="w-2 h-2 animate-pulse"
                style={{ backgroundColor: tone.color }}
                aria-hidden="true"
              />
              <h3 className="text-[12px] font-semibold tracking-wide uppercase text-on-surface-variant">
                Sector Briefing · Today
              </h3>
            </div>
            {doc?.today_label && (
              <span
                className={`px-3 py-1 text-[11px] font-semibold tracking-wide uppercase rounded-sm ${tone.chipBg}`}
                style={{ color: tone.color }}
              >
                {doc.today_label}
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-4 flex-wrap">
            <h1 className="text-[40px] md:text-[52px] font-bold tracking-[-0.02em] leading-none text-on-surface">
              {sectorLabel}
            </h1>
            {typeof doc?.today_score === "number" && (
              <div className="flex items-baseline gap-1.5">
                <span
                  className="text-[32px] font-bold tabular-nums leading-none"
                  style={{ color: tone.color }}
                >
                  {Math.round(doc.today_score)}
                </span>
                <span className="text-[12px] font-semibold text-on-surface-variant">
                  / 100
                </span>
              </div>
            )}
          </div>

          {heroBrief && (
            <p className="text-[20px] md:text-[22px] leading-snug text-on-surface font-medium tracking-[-0.01em] max-w-[68ch]">
              {heroBrief}
            </p>
          )}

          {hasVisual && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {visual.what_changed && (
                <ContextCard
                  label="What changed"
                  body={visual.what_changed}
                  accent="var(--primary)"
                />
              )}
              {visual.why_it_matters && (
                <ContextCard
                  label="Why it matters"
                  body={visual.why_it_matters}
                  accent="var(--signal-bullish)"
                />
              )}
              {visual.what_to_watch && (
                <ContextCard
                  label="What to watch"
                  body={visual.what_to_watch}
                  accent="var(--signal-neutral)"
                />
              )}
            </div>
          )}

          {hasWeek && (
            <div className={`flex flex-col gap-3 p-6 brutalist-border ${weekTone.softBg}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[11px] font-semibold tracking-wide uppercase text-on-surface-variant">
                  This week
                </span>
                {doc?.week_label && (
                  <span
                    className={`px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-sm ${weekTone.chipBg}`}
                    style={{ color: weekTone.color }}
                  >
                    {doc.week_label}
                  </span>
                )}
                {typeof doc?.week_score === "number" && (
                  <span
                    className="text-[12px] font-bold tabular-nums"
                    style={{ color: weekTone.color }}
                  >
                    {Math.round(doc.week_score)} / 100
                  </span>
                )}
              </div>
              {doc?.week_brief && (
                <p className="text-[14px] text-on-surface leading-relaxed max-w-[68ch]">
                  {doc.week_brief}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-on-surface-variant pt-2">
            <span>
              {typeof doc?.article_count === "number"
                ? `${doc.article_count} verified sources`
                : doc
                  ? "Synthesized briefing"
                  : "Tracked sector basket"}
            </span>
            {doc?.generated_at && <span>Updated {formatRelative(doc.generated_at)}</span>}
          </div>
        </section>

        {tickers.length > 0 ? (
          <Suspense fallback={<SectorConstituentsSkeleton />}>
            <div className="landing-stream-in flex flex-col gap-8">
              <SectorConstituentsStream market={market} tickers={tickers} />
            </div>
          </Suspense>
        ) : null}
      </div>
    </main>
  );
}
