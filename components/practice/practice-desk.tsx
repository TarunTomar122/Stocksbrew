"use client";

import * as React from "react";

import { EquityChart } from "@/components/backtest/equity-chart";
import { longDay, money, plainPct, signedMoney, signedPct, toneOf } from "@/components/backtest/format";
import { Panel } from "@/components/backtest/results";
import { OaButton } from "@/components/oa/button";
import { getFirebaseAuth } from "@/lib/firebase-client";
import type { PracticePayload, PracticeTradeResponse } from "@/lib/practice-store";
import { signInWithGoogle } from "@/lib/sign-in";
import { TheRead } from "@/components/oa/insight";
import { buildPracticeRead } from "@/lib/practice-insights";

const FIELD =
  "h-9 w-full min-w-0 rounded-md border border-oa-border bg-oa-page px-2.5 text-[14px] text-oa-fg outline-none placeholder:text-oa-muted-fg focus:border-oa-primary disabled:opacity-60";

function shares(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}


export function PracticeDesk({ initial, mode }: { initial: PracticePayload; mode: "account" | "example" }) {
  const [payload, setPayload] = React.useState(initial);
  const [symbol, setSymbol] = React.useState("");
  const [side, setSide] = React.useState<"buy" | "sell">("buy");
  const [unit, setUnit] = React.useState<"dollars" | "shares">("dollars");
  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const ticketRef = React.useRef<HTMLFormElement>(null);

  const example = mode === "example";
  const view = payload.view;
  const bench = view.benchmark;
  const gap = bench.return === null ? null : view.total_return - bench.return;
  const curve = view.curve && view.curve.dates.length >= 2 ? view.curve : null;
  const read = React.useMemo(() => buildPracticeRead(view, { example }), [view, example]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (example) return;
    const number = Number(amount);
    if (!symbol.trim()) return setMessage({ tone: "error", text: "Enter a ticker." });
    if (!(number > 0)) return setMessage({ tone: "error", text: unit === "dollars" ? "Enter a dollar amount." : "Enter a number of shares." });
    setBusy(true);
    setMessage(null);
    try {
      const reply = await fetch("/api/practice/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: symbol.trim().toUpperCase(), side, [unit]: number }),
      });
      const body = (await reply.json()) as PracticeTradeResponse;
      if (!body.ok) {
        setMessage({ tone: "error", text: body.message });
      } else {
        setPayload(body.payload);
        setAmount("");
        setMessage({
          tone: "ok",
          text: `${body.trade.side === "buy" ? "Bought" : "Sold"} ${shares(body.trade.shares)} ${body.trade.symbol} at ${money(body.trade.price)}, the close on ${longDay(body.trade.price_date)}. Paper money only.`,
        });
      }
    } catch {
      setMessage({ tone: "error", text: "The order did not go through. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  const prefill = (ticker: string, nextSide: "buy" | "sell", held?: number) => {
    setSymbol(ticker);
    setSide(nextSide);
    if (nextSide === "sell" && held) {
      setUnit("shares");
      setAmount(String(held));
    }
    setMessage(null);
    ticketRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const signIn = async () => {
    setBusy(true);
    try {
      if (!getFirebaseAuth().currentUser) await signInWithGoogle({ surface: "unknown" });
      window.location.reload();
    } catch {
      // The sign-in sheet reports its own errors.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <TheRead read={read} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {/* The lead: what the account is worth, then what is in it. */}
          <section className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card">
            {example ? (
              <div className="flex items-center justify-between gap-3 border-b border-dashed border-oa-primary bg-oa-bg px-4 py-2">
                <p className="min-w-0 text-[14px] leading-5 text-oa-fg">
                  <span className="oa-mono mr-2 rounded-sm bg-oa-primary px-1.5 py-0.5 text-[12.5px] font-medium uppercase tracking-[0.04em] text-oa-primary-fg">Example</span>
                  A made-up account at real closing prices. Not yours, not saved.
                </p>
                <OaButton onClick={signIn} loading={busy} className="shrink-0 max-sm:hidden">
                  Sign in to start yours
                </OaButton>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-[auto_auto_auto_auto] sm:items-end sm:justify-start sm:gap-x-10">
              <div className="col-span-2 sm:col-span-1">
                <p className="oa-caption">Account value</p>
                <p className="oa-mono mt-1 text-[30px] font-medium leading-9 tabular-nums text-oa-fg sm:text-[32px]">{money(view.equity)}</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="oa-caption">Profit or loss</p>
                <p className={`oa-mono mt-1 text-[17px] font-medium leading-7 tabular-nums ${toneOf(view.total_pnl)}`}>
                  {signedMoney(view.total_pnl)} <span className="text-[14px] font-normal">{signedPct(view.total_return, 2)}</span>
                </p>
              </div>
              <div>
                <p className="oa-caption">vs {bench.symbol}</p>
                <p className={`oa-mono mt-1 text-[17px] font-medium leading-7 tabular-nums ${gap === null ? "text-oa-muted-fg" : toneOf(gap)}`}>
                  {gap === null ? "–" : `${gap > 0 ? "+" : gap < 0 ? "−" : ""}${(Math.abs(gap) * 100).toFixed(2)} pts`}
                </p>
              </div>
              <div>
                <p className="oa-caption">Cash</p>
                <p className="oa-mono mt-1 text-[17px] font-medium leading-7 tabular-nums text-oa-fg">{money(view.cash, 0)}</p>
              </div>
            </div>
            <p className="border-t border-oa-border px-4 py-2 text-[12.5px] leading-[18px] text-oa-muted-fg">
              From {money(view.start_cash, 0)} of paper money on {longDay(bench.start_date)}.{" "}
              {bench.return !== null && bench.value !== null ? `The same money in ${bench.symbol} would be ${money(bench.value)}.` : ""}
            </p>

            <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-oa-border bg-oa-bg px-4 py-2">
              <h2 className="oa-label">Positions</h2>
              {view.price_as_of ? <p className="text-[12.5px] text-oa-muted-fg">valued at the close on {longDay(view.price_as_of)}</p> : null}
            </div>
            {view.rows.length === 0 ? (
              <p className="max-w-[70ch] border-t border-oa-border px-4 py-5 text-[14px] leading-[22px] text-oa-muted-fg">
                No positions yet. The account is {money(view.cash, 0)} of paper cash. Place a first order with the ticket{" "}
                <span className="lg:hidden">below</span>
                <span className="hidden lg:inline">on the right</span>.
              </p>
            ) : (
              <table className="w-full border-collapse border-t border-oa-border text-[14px]">
                <thead>
                  <tr className="border-b border-oa-border text-left">
                    <th className="oa-caption py-2 pl-4 pr-2">Ticker</th>
                    <th className="oa-caption hidden px-2 py-2 text-right sm:table-cell">Shares</th>
                    <th className="oa-caption hidden px-2 py-2 text-right md:table-cell">Avg cost</th>
                    <th className="oa-caption hidden px-2 py-2 text-right md:table-cell">Last close</th>
                    <th className="oa-caption px-2 py-2 text-right">Value</th>
                    <th className="oa-caption px-2 py-2 text-right max-sm:pr-4">Profit or loss</th>
                    <th className="oa-caption hidden px-2 py-2 text-right sm:table-cell">Weight</th>
                    {example ? null : <th className="py-2 pl-2 pr-4" />}
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row) => (
                    <tr key={row.symbol} className="h-11 border-b border-oa-border last:border-0 hover:bg-oa-accent">
                      <td className="py-1 pl-4 pr-2">
                        <span className="oa-mono font-medium text-oa-fg">{row.symbol}</span>
                        <span className="oa-mono block text-[12.5px] tabular-nums text-oa-muted-fg sm:hidden">{shares(row.shares)} sh</span>
                      </td>
                      <td className="oa-mono hidden px-2 text-right tabular-nums text-oa-fg sm:table-cell">{shares(row.shares)}</td>
                      <td className="oa-mono hidden px-2 text-right tabular-nums text-oa-muted-fg md:table-cell">{money(row.average_cost)}</td>
                      <td className="oa-mono hidden px-2 text-right tabular-nums text-oa-muted-fg md:table-cell">{row.price === null ? "no price" : money(row.price)}</td>
                      <td className="oa-mono px-2 text-right tabular-nums text-oa-fg">{row.value === null ? "–" : money(row.value)}</td>
                      <td className={`oa-mono whitespace-nowrap px-2 text-right tabular-nums max-sm:pr-4 ${toneOf(row.pnl)}`}>
                        {signedMoney(row.pnl)}
                        <span className="text-[12.5px] max-sm:block sm:ml-2">{signedPct(row.pnl_pct)}</span>
                      </td>
                      <td className={`oa-mono hidden px-2 text-right tabular-nums text-oa-muted-fg sm:table-cell ${example ? "sm:pr-4" : ""}`}>{plainPct(row.weight)}</td>
                      {example ? null : (
                        <td className="py-1 pl-2 pr-4 text-right">
                          <button
                            type="button"
                            className="-my-1 inline-flex h-10 items-center px-1 text-[14px] font-medium text-oa-muted-fg hover:text-oa-fg hover:underline"
                            onClick={() => prefill(row.symbol, "sell", row.shares)}
                          >
                            Sell
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {view.unpriced.length > 0 ? (
              <p className="border-t border-oa-border bg-oa-bg px-4 py-2 text-[12.5px] leading-5 text-oa-fg">
                No current price for {view.unpriced.join(", ")}, so {view.unpriced.length === 1 ? "it is" : "they are"} counted at cost.
              </p>
            ) : null}
            {example ? (
              <div className="border-t border-oa-border px-4 py-3 sm:hidden">
                <OaButton onClick={signIn} loading={busy} className="w-full">
                  Sign in to start yours
                </OaButton>
              </div>
            ) : null}
          </section>

          {curve ? (
            <Panel title={`Account value against ${bench.symbol}`} aside={example ? "Example" : "Paper money"} bodyClassName="px-3.5 py-3">
              <EquityChart
                curve={{ dates: curve.dates, strategy: curve.account, benchmark: curve.benchmark }}
                strategyLabel={example ? "Example account" : "Your practice account"}
                benchmarkLabel={`Same money in ${bench.symbol}`}
                unit="money"
              />
            </Panel>
          ) : (
            <Panel title={`Account value against ${bench.symbol}`} bodyClassName="px-3.5 py-4">
              <p className="text-[14px] leading-6 text-oa-muted-fg">
                The chart starts once there are two closes to draw. The comparison is {money(view.start_cash, 0)} put into {bench.symbol} at its close on{" "}
                {longDay(bench.start_date)}.
              </p>
            </Panel>
          )}

          <Panel title="Trade log" aside={`${view.trades.length} order${view.trades.length === 1 ? "" : "s"}`}>
            {view.trades.length === 0 ? (
              <p className="px-3.5 py-5 text-[14px] text-oa-muted-fg">No orders yet.</p>
            ) : (
              <ul className="max-h-[26rem] divide-y divide-oa-border overflow-y-auto">
                {view.trades.map((trade) => (
                  <li key={trade.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3.5 py-2 text-[13px] hover:bg-oa-accent">
                    <span className="min-w-0">
                      {/* Buying or selling is neither good nor bad, so the verb stays in normal ink. */}
                      <span className="font-medium text-oa-fg">{trade.side === "buy" ? "Bought" : "Sold"}</span>{" "}
                      <span className="oa-mono tabular-nums text-oa-fg">{shares(trade.shares)}</span> <span className="oa-mono font-medium text-oa-fg">{trade.symbol}</span>{" "}
                      <span className="text-oa-muted-fg">at</span> <span className="oa-mono tabular-nums text-oa-fg">{money(trade.price)}</span>
                      <span className="block text-[12px] text-oa-muted-fg">close of {longDay(trade.price_date)}</span>
                    </span>
                    <span className="oa-mono text-right tabular-nums text-oa-fg">{money(trade.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4">
          <form ref={ticketRef} onSubmit={submit} className="oa-surface scroll-mt-20 overflow-hidden border border-oa-border bg-oa-card">
            <div className="flex min-h-11 items-center justify-between border-b border-oa-border px-3.5 py-2">
              <h2 className="oa-label">Order ticket</h2>
              <span className="text-[12.5px] text-oa-muted-fg">Paper money</span>
            </div>
            <fieldset disabled={example} className="flex flex-col gap-2.5 px-3.5 py-3 disabled:opacity-60">
              <div className="grid grid-cols-2 gap-1 rounded-md bg-oa-bg p-1" role="group" aria-label="Side">
                {(["buy", "sell"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={side === option}
                    onClick={() => setSide(option)}
                    className={`h-9 rounded text-[14px] font-medium capitalize ${side === option ? "bg-oa-card text-oa-fg shadow-sm" : "text-oa-muted-fg hover:text-oa-fg"}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <label>
                <span className="oa-caption">Ticker</span>
                <input
                  className={`${FIELD} oa-mono mt-1 uppercase`}
                  placeholder="AAPL"
                  value={symbol}
                  maxLength={12}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                />
              </label>
              <div>
                <span className="oa-caption">Amount</span>
                <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <input
                    aria-label={unit === "dollars" ? "Dollar amount" : "Number of shares"}
                    className={`${FIELD} oa-mono text-right tabular-nums`}
                    inputMode="decimal"
                    placeholder={unit === "dollars" ? "5000" : "10"}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
                  />
                  <select aria-label="Amount in" className={`${FIELD} w-auto`} value={unit} onChange={(event) => setUnit(event.target.value as "dollars" | "shares")}>
                    <option value="dollars">dollars</option>
                    <option value="shares">shares</option>
                  </select>
                </div>
              </div>
              <OaButton type="submit" loading={busy && !example} className="mt-0.5 w-full">
                {side === "buy" ? "Buy with paper money" : "Sell"}
              </OaButton>
            </fieldset>
            {message ? (
              <p role={message.tone === "error" ? "alert" : "status"} className={`border-t border-oa-border bg-oa-bg px-3.5 py-2 text-[13px] leading-5 ${message.tone === "error" ? "text-signal-bearish" : "text-oa-fg"}`}>
                {message.text}
              </p>
            ) : null}
            <p className="border-t border-oa-border px-3.5 py-2 text-[12px] leading-5 text-oa-muted-fg">
              {example ? "Sign in to place orders. " : ""}Orders fill at the latest close
              {view.price_as_of ? ` (${longDay(view.price_as_of)})` : ""}, not a live quote.
            </p>
          </form>

          <Panel title="How it works">
            <ul className="divide-y divide-oa-border text-[13.5px] leading-[1.5] text-oa-fg">
              {example ? (
                <li className="px-3.5 py-2.5">
                  The account shown is made up so you can see how it works: six buys and one sell placed from {longDay(bench.start_date)}, valued at real
                  closing prices. It is not yours and it is not saved.
                </li>
              ) : null}
              <li className="px-3.5 py-2.5">You get {money(view.start_cash, 0)} of paper money. Nothing here is real cash and no order leaves this page.</li>
              <li className="px-3.5 py-2.5">A buy or sell fills at the last daily close. No price, no fill.</li>
              <li className="px-3.5 py-2.5">The comparison is simple: the same starting money put into {bench.symbol} on the day you began.</li>
              <li className="px-3.5 py-2.5">No fees, no taxes, no dividends paid in cash. Real trading has all three, so a real account would do a little worse.</li>
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
