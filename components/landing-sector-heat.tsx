import { AnimatedIcon } from "@/components/animated-icon";
import Link from "next/link";
import { SectorHeatStockRow } from "@/components/sector-heat-stock-row";
import {
  SECTOR_THEME,
  sectorPctMove,
  type SectorHeatCard,
} from "@/lib/landing-sector-data";
import type { CSSProperties } from "react";

export type { SectorHeatCard };

export function LandingSectorHeat({
  sectors,
  trackedIds = [],
  isSubscribed = false,
}: {
  sectors: SectorHeatCard[];
  trackedIds?: string[];
  isSubscribed?: boolean;
}) {
  return (
    <section className="border-b border-outline-variant bg-background">
      <div className="landing-inner py-16 lg:py-20">
        <div className="landing-card overflow-hidden p-5 md:p-6">
          <div className="mb-8">
            <p className="landing-section-kicker text-landing-brand">// Market Overview</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-on-surface sm:text-3xl">
              How the sectors are leaning
            </h2>
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-on-surface-variant">
              Live snapshot of sector performance and top movers.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sectors.map((s) => {
              const theme = SECTOR_THEME[s.label] ?? { accent: "var(--landing-brand)", icon: "insights" };
              const sectorMove = sectorPctMove(s.avg);

              return (
                <div
                  key={s.label}
                  className="sector-heat-card"
                  style={{ "--sector-accent": theme.accent } as CSSProperties}
                >
                  <div className="relative z-[1] flex flex-col p-4 pb-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="sector-heat-icon">
                          <AnimatedIcon name={theme.icon} size={12} aria-hidden />
                        </div>
                        <span className="truncate text-[15px] font-bold text-on-surface">{s.label}</span>
                      </div>
                      <span
                        className="flex shrink-0 items-center gap-1 text-[13px] font-bold tabular-nums"
                        style={{ color: sectorMove.color }}
                      >
                        <span className="text-[10px] leading-none">{sectorMove.up ? "▲" : "▼"}</span>
                        {Math.abs(s.avg).toFixed(2)}%
                      </span>
                    </div>

                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface-variant">
                      Top stocks
                    </p>
                    <div className="mb-1 mt-2 border-t border-outline-variant" />

                    <div className="w-full space-y-0">
                      {s.stocks.map((x) => (
                        <SectorHeatStockRow
                          key={x.ticker}
                          ticker={x.ticker}
                          instrumentId={x.instrumentId}
                          changePct={x.changePct}
                          isTracked={trackedIds.includes(x.instrumentId)}
                          isSubscribed={isSubscribed}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="sector-heat-cta mt-6">
            <div className="flex items-center gap-2.5 text-[13px] leading-snug text-on-surface-variant">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-outline-variant bg-surface">
                <AnimatedIcon name="monitoring" size={18} className="text-landing-brand" aria-hidden />
              </div>
              Market moves fast. StocksBrew Pro gives you the clarity to stay ahead.
            </div>
            <Link href="/subscribe" className="landing-btn-primary shrink-0 px-5 py-2.5 text-sm">
              Explore StocksBrew Pro →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
