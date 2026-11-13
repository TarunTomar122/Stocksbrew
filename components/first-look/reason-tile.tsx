"use client";

import * as React from "react";

import { ReasonsSheet } from "@/components/thesis/reasons-sheet";
import { loadTheses, useAllTheses, useStoreVersion } from "@/components/thesis/store";
import { StockLogo } from "@/components/stock-logo";
import type { ReasonAsk } from "@/lib/first-look/types";
import { thesisSentence } from "@/lib/thesis";

import { FOCUS, ROW, ROW_CONTROL, ROW_EVIDENCE, ROW_ICON, ROW_LINE, ROW_NAME } from "./grid";

const BUTTON = `inline-flex h-7 shrink-0 items-center justify-center rounded-lg border border-oa-border bg-oa-card px-3 text-[13px] font-medium text-oa-fg hover:border-oa-fg/30 ${FOCUS}`;

/**
 * One row, "Why do you own X?", for their largest holding without a reason: one tap opens the reasons sheet on that stock, with
 * its "Holds if…" lines. Once it has a reason, the card moves on to the next largest; with all of them done it says so.
 */
export function ReasonRow({ asks }: { asks: ReasonAsk[] }) {
  const all = useAllTheses();
  useStoreVersion();
  const [open, setOpen] = React.useState<ReasonAsk | "list" | null>(null);

  React.useEffect(() => {
    // Only the reasons, not every stock's check: the card needs to know which have one.
    loadTheses({ checkAll: false });
  }, []);

  if (asks.length === 0) return null;
  const next = all ? asks.find((ask) => !all[ask.instrument_id]) ?? null : asks[0]!;
  const done = all !== null && next === null;
  const shown = next ?? asks[0]!;
  const saved = all?.[shown.instrument_id] ?? null;

  return (
    <li className={ROW}>
      <StockLogo ticker={shown.ticker} size={28} circle atOnce className={ROW_ICON} />
      <span className={ROW_NAME}>{done ? "Your reasons are in" : `Why do you own ${shown.ticker}?`}</span>
      <span className={ROW_LINE}>{done && saved ? `${shown.ticker}: ${thesisSentence(saved)}` : "Say why, and the numbers that would change your mind. I'll watch them."}</span>
      <span aria-hidden="true" className={`${ROW_EVIDENCE} hidden [@container(min-width:48rem)]:flex`} />
      <span className={ROW_CONTROL}>
        <button type="button" className={BUTTON} onClick={() => setOpen(done ? "list" : shown)}>
          {done ? "Review reasons" : "Add my reason"}
        </button>
      </span>
      {open ? (
        <ReasonsSheet
          stocks={asks.map((ask) => ({ instrument_id: ask.instrument_id, ticker: ask.ticker, name: ask.name }))}
          start={open === "list" ? null : { instrument_id: open.instrument_id, ticker: open.ticker, name: open.name }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </li>
  );
}
