"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CARD, FOCUS, NUM } from "@/components/portfolio/parts";
import { ProMark } from "@/components/oa/gate";
import { StockLogo } from "@/components/stock-logo";
import Link from "next/link";

/** What the server worked out about coverage for this account (lib/entitlements-coverage.ts). */
export type PortfolioCoverage = {
  covered: string[];
  /** Earlier picks past today's limit, free to pick back once each (lib/entitlements-coverage.ts heldPicks). */
  held?: string[];
  limit: number;
  fillsLeft: number;
  swapAvailable: boolean;
  nextSwapAt: string | null;
};

type Stock = { instrument_id: string; ticker: string; name: string | null };

function fmtSwapDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function joinTickers(tickers: string[]): string {
  return tickers.length <= 1 ? (tickers[0] ?? "") : `${tickers.slice(0, -1).join(", ")} and ${tickers[tickers.length - 1]}`;
}

/**
 * Free: which tracked stocks the agent covers in full, and a way to change it.
 * Tracking stays unlimited; this only moves the covered slots around.
 * Every change goes through POST /api/coverage, which enforces the limit and
 * the weekly swap; the page re-reads after a change.
 */
export function CoveragePanel({ coverage, stocks }: { coverage: PortfolioCoverage; stocks: Stock[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const covered = new Set(coverage.covered);
  const full = coverage.covered.length >= coverage.limit;
  const coveredStocks = stocks.filter((stock) => covered.has(stock.instrument_id));
  const heldStocks = stocks.filter((stock) => (coverage.held ?? []).includes(stock.instrument_id));

  async function toggle(stock: Stock, next: boolean) {
    setBusy(stock.instrument_id);
    setError(null);
    try {
      const res = await fetch("/api/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument_id: stock.instrument_id, covered: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setError(data.message || "That did not save. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("That did not save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  const rule =
    coverage.fillsLeft > 0
      ? `${coverage.fillsLeft} free ${coverage.fillsLeft === 1 ? "pick" : "picks"} left, then one swap a week.`
      : coverage.swapAvailable
        ? "Your swap for this week is ready."
        : coverage.nextSwapAt
          ? `This week's swap is used. The next one opens ${fmtSwapDay(coverage.nextSwapAt)}.`
          : "This week's swap is used.";

  return (
    <section className={CARD} aria-label="Covered stocks">
      <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[14px] leading-5 text-oa-fg">
            <span className="font-medium">Covered in full</span>
            <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>
              {coverage.covered.length} of {coverage.limit}
            </span>
            {coveredStocks.length > 0 ? (
              <span className="oa-mono text-[12.5px] text-oa-muted-fg">{coveredStocks.map((stock) => stock.ticker).join(" · ")}</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">
            Covered stocks get price zones, the whole brief and the pre-earnings read. Everything you track gets prices, the call and earnings dates.
          </p>
          {heldStocks.length > 0 ? (
            <p className="mt-1.5 text-pretty text-[12.5px] leading-[18px] text-oa-fg">
              Free now covers {coverage.limit} stocks, so we kept the first {coverage.limit} you chose. You also had {joinTickers(heldStocks.map((stock) => stock.ticker))}{" "}
              covered: pick {heldStocks.length === 1 ? "it" : "any of them"} back here at no cost (uncover one first), without using your weekly swap.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="coverage-chooser"
          onClick={() => setOpen((value) => !value)}
          className={`inline-flex h-8 shrink-0 cursor-pointer items-center self-start rounded border border-oa-border bg-oa-card px-3 text-[12.5px] font-medium text-oa-fg transition-colors hover:border-oa-fg/30 sm:self-auto ${FOCUS}`}
        >
          {open ? "Done" : "Choose covered stocks"}
        </button>
      </div>

      {open ? (
        <div id="coverage-chooser" className="border-t border-oa-border">
          <ul className="max-h-[22rem] divide-y divide-oa-border overflow-y-auto">
            {stocks.map((stock) => {
              const isCovered = covered.has(stock.instrument_id);
              // With no pick or swap left the server still allows re-covering a stock from this week, so only a
              // full set of slots disables the button; anything else is the server's call and it says why.
              const blocked = !isCovered && full;
              return (
                <li key={stock.instrument_id} className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="oa-mono inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-oa-fg">
                      <StockLogo ticker={stock.ticker} size={18} />
                      {stock.ticker}
                    </span>
                    {stock.name && stock.name !== stock.ticker ? (
                      <span className="truncate text-[12.5px] text-oa-muted-fg">{stock.name}</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    aria-pressed={isCovered}
                    disabled={busy !== null || blocked}
                    title={blocked ? "Uncover one first" : undefined}
                    onClick={() => toggle(stock, !isCovered)}
                    className={`inline-flex h-8 min-w-[6.5rem] shrink-0 cursor-pointer items-center justify-center rounded border px-2.5 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS} ${
                      isCovered
                        ? "border-oa-primary bg-[color-mix(in_srgb,var(--oa-primary)_10%,transparent)] text-oa-primary"
                        : "border-oa-border bg-oa-card text-oa-fg hover:border-oa-fg/30"
                    }`}
                  >
                    {busy === stock.instrument_id ? "Saving" : isCovered ? "Covered" : "Cover"}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-1 border-t border-oa-border bg-oa-bg px-3 py-2 text-[12.5px] leading-[18px] text-oa-muted-fg sm:flex-row sm:items-center sm:justify-between">
            <p role="status" className={error ? "text-signal-bearish" : undefined}>
              {error ?? (full ? `All ${coverage.limit} slots are in use. Uncover one to make room; uncovering is free any time. ${rule}` : rule)}
            </p>
            <Link prefetch={false} href="/pricing#covered_stocks" className="inline-flex shrink-0 items-center gap-1.5 text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
              Cover everything <ProMark />
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
