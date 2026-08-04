"use client";

import { useState } from "react";
import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { DiagnosisSectorChart } from "@/components/diagnosis-charts";
import { RadarBookTable } from "@/components/radar-book-table";
import { verdictLabel } from "@/components/watchlist-sections";
import { isAiSummary } from "@/lib/radar-copy";
import { FactorPillar, PctChange, WsSectionHead } from "@/components/radar-workstation-ui";
import type { RadarHubModel, RadarReceipt } from "@/lib/radar-hub-data";

type MobileTab = "book" | "health";

function MobileTabBar({ tab, onTab }: { tab: MobileTab; onTab: (t: MobileTab) => void }) {
  const items: { key: MobileTab; label: string }[] = [
    { key: "book", label: "Book" },
    { key: "health", label: "Health" },
  ];
  return (
    <div className="mb-4 flex border-b border-outline-variant/60 lg:hidden">
      {items.map((item) => {
        const on = tab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onTab(item.key)}
            className="-mb-px flex-1 border-b-2 pb-2.5 font-mono text-[12px] font-semibold transition-colors"
            style={{
              borderColor: on ? "var(--on-surface)" : "transparent",
              color: on ? "var(--on-surface)" : "var(--on-surface-variant)",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function DiagnosisBlock({
  model,
  isSubscribed,
}: {
  model: RadarHubModel;
  isSubscribed: boolean;
}) {
  const { diagnosis } = model;
  const { pillars, clusters } = diagnosis;
  const overall = pillars.overall;
  const summary =
    diagnosis.summary && !isAiSummary(diagnosis.summary) ? diagnosis.summary : undefined;
  const topRisk = diagnosis.riskFlags[0];
  const hasContent =
    summary ||
    overall !== null ||
    diagnosis.riskFlags.length > 0 ||
    clusters.length > 0 ||
    diagnosis.blindSpotTitle;

  if (!hasContent && model.stats.totalCount < 2) {
    return (
      <div className="mb-8 border-b border-outline-variant/40 pb-8">
        <WsSectionHead>Whole book</WsSectionHead>
        <p className="mt-3 text-[13px] text-on-surface-variant">
          Add a second name and we&apos;ll score concentration, sector mix, and blind spots.
        </p>
      </div>
    );
  }

  return (
    <div className="relative mb-8 border-b border-outline-variant/40 pb-8">
      <WsSectionHead aside={overall !== null ? verdictLabel(overall) : undefined}>Whole book</WsSectionHead>

      <div className={`mt-4 ${!isSubscribed ? "pointer-events-none select-none blur-[5px]" : ""}`}>
        <div className="flex flex-wrap items-end gap-5 sm:gap-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">Score</p>
            <p className="mt-1 text-[40px] font-bold tabular-nums leading-none tracking-tight text-on-surface sm:text-[44px]">
              {overall === null ? "—" : Math.round(overall)}
            </p>
          </div>
          <div className="grid min-w-[220px] flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <FactorPillar label="val" score={pillars.valuation} muted />
            <FactorPillar label="growth" score={pillars.growth} muted />
            <FactorPillar label="quality" score={pillars.quality} muted />
            <FactorPillar label="mom" score={pillars.momentum} muted />
          </div>
        </div>

        {clusters.length > 0 ? (
          <div className="mt-5">
            <DiagnosisSectorChart
              bare
              sectors={clusters.map((c) => ({
                sector: c.sector,
                weight_pct: c.weightPct,
                count: c.count,
              }))}
            />
          </div>
        ) : null}

        {summary ? (
          <p className="mt-4 text-[13px] leading-relaxed text-on-surface">{summary}</p>
        ) : null}

        {topRisk ? (
          <div className="mt-4 border-l-2 border-outline-variant pl-3">
            <p className="text-[13px] font-semibold text-on-surface">{topRisk.headline}</p>
            {topRisk.body ? (
              <p className="mt-0.5 text-[12px] leading-snug text-on-surface-variant">{topRisk.body}</p>
            ) : null}
          </div>
        ) : null}

        {diagnosis.blindSpotTitle ? (
          <div className="mt-4 border-l-2 border-outline-variant pl-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">
              Blind spot
            </p>
            <p className="mt-1 text-[13px] font-semibold text-on-surface">{diagnosis.blindSpotTitle}</p>
            {diagnosis.blindSpotBody ? (
              <p className="mt-0.5 text-[12px] leading-relaxed text-on-surface-variant">
                {diagnosis.blindSpotBody}
              </p>
            ) : null}
          </div>
        ) : null}

        {diagnosis.regime ? (
          <p className="mt-4 font-mono text-[11px] text-on-surface-variant">Regime · {diagnosis.regime}</p>
        ) : null}
      </div>

      {!isSubscribed ? (
        <div
          className="absolute inset-0 grid place-items-center px-4"
          style={{ background: "color-mix(in srgb, var(--background) 55%, transparent)" }}
        >
          <div className="max-w-sm text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Pro</p>
            <p className="mt-2 text-[15px] font-semibold text-on-surface">Whole-book diagnosis</p>
            <p className="mt-1 text-[13px] text-on-surface-variant">Score, sector mix, and concentration risks.</p>
            <Link
              href="/subscribe"
              className="mt-4 inline-block border border-on-surface px-5 py-2 font-mono text-[12px] font-semibold text-on-surface transition-colors hover:bg-on-surface hover:text-surface"
            >
              unlock →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReceiptsFold({ receipts }: { receipts: RadarReceipt[] }) {
  const [open, setOpen] = useState(false);
  if (receipts.length < 2) return null;
  return (
    <div className="mt-8 border-t border-outline-variant/50 pt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-baseline gap-2 text-left"
      >
        <WsSectionHead aside={`${receipts.length}`}>Called it</WsSectionHead>
        <span className="ml-auto font-mono text-[12px] text-on-surface-variant">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="mt-3 divide-y divide-outline-variant/40">
          {receipts.slice(0, 6).map((r) => (
            <Link
              key={`${r.ticker}-${r.eventDate}`}
              href={`/stock/${r.ticker}`}
              className="flex items-start gap-3 py-3 transition-colors hover:bg-surface-container-low/50"
            >
              <StockLogo ticker={r.ticker} logoUrl={r.logoUrl} market="US" size={20} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[12px] font-bold text-on-surface">{r.ticker}</span>
                  <PctChange value={r.dayChangePct} className="ml-auto text-[11px]" />
                </div>
                <p className="mt-0.5 text-[12px] leading-snug text-on-surface-variant">{r.call}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProUpsell({
  stats,
  atLimit,
}: {
  stats: RadarHubModel["stats"];
  atLimit: boolean;
}) {
  return (
    <div className="mt-8 flex flex-col items-start justify-between gap-4 border-t border-outline-variant/50 pt-6 sm:flex-row sm:items-center">
      <div>
        <p className="text-[15px] font-semibold text-on-surface">
          {atLimit ? "You're at your 3-stock limit." : `Tracking ${stats.totalCount} names.`}
        </p>
        <p className="mt-0.5 text-[13px] text-on-surface-variant">
          Add your whole book for diagnosis and alerts on every name.
        </p>
      </div>
      <Link
        href="/subscribe"
        className="whitespace-nowrap border border-on-surface px-5 py-2.5 font-mono text-[12px] font-semibold text-on-surface transition-colors hover:bg-on-surface hover:text-surface"
      >
        track everything →
      </Link>
    </div>
  );
}

export function RadarHub({
  model,
  isSubscribed,
  atLimit,
  embedded = false,
}: {
  model: RadarHubModel;
  isSubscribed: boolean;
  atLimit: boolean;
  embedded?: boolean;
}) {
  const { stats } = model;
  const [mobileTab, setMobileTab] = useState<MobileTab>("book");

  const healthColumn = <DiagnosisBlock model={model} isSubscribed={isSubscribed} />;
  const bookColumn = (
    <>
      <div className="hidden lg:block">{healthColumn}</div>
      <RadarBookTable model={model} />
      <ReceiptsFold receipts={model.receipts} />
    </>
  );

  return (
    <div className={embedded ? "w-full pb-12" : "w-full px-0 py-6 sm:py-8"}>
      {!embedded ? (
        <>
          <div className="flex items-center gap-3">
            <div className="font-mono text-[12px] text-on-surface-variant">// your watchlist</div>
            {isSubscribed ? (
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">
                pro
              </span>
            ) : (
              <Link href="/subscribe" className="ml-auto font-mono text-[11px] text-on-surface-variant">
                free · {stats.totalCount}/3
              </Link>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-on-surface sm:text-3xl md:text-[2rem]">
            The market, on your stocks.
          </h1>
        </>
      ) : (
        !isSubscribed && (
          <div className="mb-2 flex justify-end">
            <Link href="/subscribe" className="font-mono text-[11px] text-on-surface-variant">
              free · {stats.totalCount}/3
            </Link>
          </div>
        )
      )}

      <div className="mt-5 sm:mt-6">
        <MobileTabBar tab={mobileTab} onTab={setMobileTab} />

        <div className="radar-ws hidden p-6 sm:p-8 lg:block">
          {bookColumn}
        </div>

        <div className="radar-ws p-4 sm:p-5 lg:hidden">
          {mobileTab === "book" ? bookColumn : <div className="px-1 py-1">{healthColumn}</div>}
        </div>
      </div>

      {!isSubscribed ? <ProUpsell stats={stats} atLimit={atLimit} /> : null}
    </div>
  );
}

// Legacy type exports for any external imports
export type RadarCall = {
  ticker: string;
  name?: string;
  logoUrl?: string | null;
  market: "US" | "IN";
  price: number | null;
  changePct: number | null;
  stance: string;
  action?: string;
  trigger?: string;
  covered: boolean;
};
export type RadarChange = { ticker: string; tone: "up" | "down" | "neutral"; text: string };
export type RadarSector = { label: string; pct: number };
export type RadarFactor = { label: string; score: number };
export type RadarSuggestion = { ticker: string; name?: string; reason?: string; market: "US" | "IN" };
export type { RadarReceipt };
