"use client";

import * as React from "react";

import { CONTROL } from "@/components/screener/controls";
import { useUser } from "@/lib/auth-context";
import { setupHref } from "@/lib/backtest/setup";
import { compareHref } from "@/lib/compare-shared";
import { signInWithGoogle } from "@/lib/sign-in";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";

/**
 * What you can do with a set of tickers: follow them, compare them, or
 * backtest them as an equal-weight basket. Used under a screener selection,
 * on an idea basket and on the compare desk.
 */

type WatchState =
  | { kind: "idle" }
  | { kind: "working"; done: number; total: number }
  | { kind: "done"; added: number; total: number }
  | { kind: "limit"; added: number; total: number; reason: string }
  | { kind: "error"; message: string };

export function backtestHref(symbols: readonly string[]): string {
  return setupHref({
    holdings: symbols.slice(0, 30).map((symbol) => ({ symbol, weight: 1 })),
    start: null,
    end: null,
    rebalance: "monthly",
    benchmark: "SPY",
    cost_bps: 10,
  });
}

async function addOne(symbol: string): Promise<{ ok: boolean; status: number; reason?: string }> {
  const response = await fetch("/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ instrument_id: `US_${symbol}`, position_type: "watchlist" }),
  });
  if (response.ok) return { ok: true, status: response.status };
  const body = (await response.json().catch(() => ({}))) as { reason?: string; error?: string };
  return { ok: false, status: response.status, reason: body.reason ?? body.error };
}

export function WatchlistButton({
  symbols,
  label,
  className = "",
}: {
  symbols: readonly string[];
  /** Defaults to "Add N to watchlist". */
  label?: string;
  className?: string;
}) {
  const { user } = useUser();
  const [state, setState] = React.useState<WatchState>({ kind: "idle" });
  const key = symbols.join(",");
  React.useEffect(() => setState({ kind: "idle" }), [key]);

  async function run() {
    if (symbols.length === 0 || state.kind === "working") return;
    if (!user) {
      try {
        await signInWithGoogle({ surface: "unknown" });
      } catch {
        return;
      }
    }
    let added = 0;
    setState({ kind: "working", done: 0, total: symbols.length });
    for (const [index, symbol] of symbols.entries()) {
      const result = await addOne(symbol).catch(() => ({ ok: false, status: 0, reason: "network" }));
      if (result.ok) {
        added += 1;
        setState({ kind: "working", done: index + 1, total: symbols.length });
        continue;
      }
      if (result.status === 401) {
        setState({ kind: "error", message: "Sign in to keep a watchlist." });
        return;
      }
      if (result.status === 409 && result.reason !== "profile_not_ready") {
        setState({ kind: "limit", added, total: symbols.length, reason: result.reason ?? "The free watchlist is full." });
        return;
      }
      setState({ kind: "error", message: added > 0 ? `Added ${added}, then something went wrong. Try the rest again.` : "Could not add these right now. Try again." });
      return;
    }
    setState({ kind: "done", added, total: symbols.length });
  }

  const text =
    state.kind === "working"
      ? `Adding ${state.done + 1} of ${state.total}`
      : state.kind === "done"
        ? `Added ${state.added} to watchlist`
        : label ?? (symbols.length === 1 ? "Add to watchlist" : `Add ${symbols.length} to watchlist`);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={symbols.length === 0 || state.kind === "working" || state.kind === "done"}
        className={`${CONTROL} disabled:cursor-default disabled:opacity-70 ${className}`}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          {state.kind === "done" ? <path d="M3.5 8.5l3 3 6-7" strokeLinejoin="round" /> : <path d="M8 3.5v9M3.5 8h9" />}
        </svg>
        {text}
      </button>
      {state.kind === "done" ? (
        <Link prefetch={false} href="/watchlist" className="text-[13px] text-oa-muted-fg underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
          Open watchlist
        </Link>
      ) : null}
      {state.kind === "limit" ? (
        <span role="status" className="text-[13px] leading-5 text-oa-muted-fg">
          {state.added > 0 ? `Added ${state.added} of ${state.total}. ` : ""}
          {state.reason}{" "}
          <Link prefetch={false} href="/pricing#follow_stocks" className="text-oa-primary underline underline-offset-2">
            See Pro
          </Link>
        </span>
      ) : null}
      {state.kind === "error" ? (
        <span role="alert" className="text-[13px] leading-5 text-signal-bearish">
          {state.message}
        </span>
      ) : null}
    </span>
  );
}

export function BasketActions({
  symbols,
  compareLimit,
  watchLabel,
  className = "",
}: {
  symbols: readonly string[];
  /** How many names this viewer may compare at once. Pass 0 to leave the compare link out (the compare desk itself). */
  compareLimit: number;
  watchLabel?: string;
  className?: string;
}) {
  const compareSet = symbols.slice(0, compareLimit);
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <WatchlistButton symbols={symbols} label={watchLabel} />
      {symbols.length >= 2 && compareLimit >= 2 ? (
        <AppLink href={compareHref(compareSet)} className={CONTROL}>
          Compare{symbols.length > compareLimit ? ` first ${compareLimit}` : ""}
        </AppLink>
      ) : null}
      {symbols.length >= 1 ? (
        <AppLink href={backtestHref(symbols)} className={CONTROL}>
          Backtest as a basket
        </AppLink>
      ) : null}
    </div>
  );
}
