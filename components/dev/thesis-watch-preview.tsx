"use client";

import { useState } from "react";

import { PositionsTable } from "@/components/portfolio/positions-table";
import { ReasonsStrip } from "@/components/thesis/reasons-sheet";
import { StockReason } from "@/components/thesis/stock-reason";
import { primeThesisStore } from "@/components/thesis/store";
import type { PortfolioPosition, PortfolioTotals } from "@/lib/portfolio-shared";
import type { Thesis } from "@/lib/thesis";
import type { CheckView } from "@/lib/thesis-watch/server";

/** Dev-only: the reason watcher's parts on fixture reasons (app/dev/thesis-watch). */
export function ThesisWatchPreview(props: {
  positions: PortfolioPosition[];
  totals: PortfolioTotals;
  today: string;
  theses: Record<string, Thesis>;
  held: string[];
  checks: Record<string, CheckView>;
  locked: string[];
  ticker: string;
  empty: boolean;
}) {
  // Primed once, before the first render of the parts that read the store.
  useState(() => {
    primeThesisStore(props.empty ? { theses: {}, held: props.held, checks: {} } : { theses: props.theses, held: props.held, checks: props.checks, locked: props.locked });
    return true;
  });
  const holdings = props.positions.filter((position) => position.kind === "holding");
  return (
    <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-4 px-4 pb-24 pt-4 sm:px-6 lg:pb-10">
        <StockReason ticker={props.ticker} preview />
        <section className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
          <ReasonsStrip stocks={holdings.map((position) => ({ instrument_id: position.instrument_id, ticker: position.ticker, name: position.name }))} />
          <PositionsTable positions={holdings} kind="holding" today={props.today} defaultSort={{ key: "value", direction: "desc" }} totals={props.totals} />
        </section>
    </div>
  );
}
