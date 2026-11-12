"use client";

import { CALL_PLAIN } from "@/lib/plain-copy";
import { callWord } from "@/lib/stock-chart";
import Link from "next/link";
import { useState } from "react";

import { MarkSlot } from "@/components/oa/kit/tone";
import { CARD, EmptyNote, FOCUS, NUM, Pct, SectionTitle } from "@/components/portfolio/parts";
import { PreferenceToggle } from "@/components/preference-toggle";
import { StockLogo } from "@/components/stock-logo";
import { WholeRows } from "@/components/wire/whole-rows";
import { groupAlerts } from "@/lib/alert-distance";
import { createStockAlert, deleteStockAlert } from "@/lib/create-alert";
import { limitFor } from "@/lib/entitlements";
import { fmtDay, fmtMoney, type PortfolioPosition } from "@/lib/portfolio-shared";

export type PortfolioAlert = {
  id: string;
  ticker: string;
  instrument_id: string;
  kind: string;
  condition: "above" | "below" | null;
  target_price: number | null;
  created_at: string | null;
  note: string | null;
};

export type PortfolioSignal = { ticker: string; title: string; body: string; tone: "bull" | "bear" | "neutral" };

const KIND_LABEL: Record<string, string> = {
  earnings_24h: "Email the day before earnings",
  brief_ready: "Email when the research is ready",
  directive_change: "Email when our call changes",
  anomaly: "Email on an unusual move",
  rsi_extreme: "Email when RSI hits an extreme",
  news_velocity: "Email when news volume jumps",
};

function describe(alert: PortfolioAlert): string {
  if (alert.kind === "price_threshold" && alert.target_price !== null && alert.condition) {
    return `Price ${alert.condition} ${fmtMoney(alert.target_price)}`;
  }
  return KIND_LABEL[alert.kind] ?? alert.kind.replace(/_/g, " ");
}

function plainCallWord(stance: string | null | undefined): string {
  const call = callWord(stance);
  return call ? CALL_PLAIN[call] : String(stance ?? "");
}

export function AlertsTab({
  alerts: initialAlerts,
  signals,
  positions,
  isSubscribed,
  emailPrefs,
  example,
}: {
  alerts: PortfolioAlert[];
  signals: PortfolioSignal[];
  /** Holdings and watched names, for the "in its zone" list and the new-alert form. */
  positions: PortfolioPosition[];
  isSubscribed: boolean;
  emailPrefs: { alerts: boolean; digest: boolean } | null;
  example: boolean;
}) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ id: positions[0]?.instrument_id ?? "", condition: "below" as "below" | "above", price: "" });
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const priceById = new Map(positions.map((position) => [position.instrument_id, position.price]));
  // Free keeps a few price alerts (lib/entitlements.ts: price_alerts); the server enforces it, this only says it.
  const priceLimit = limitFor("price_alerts", isSubscribed ? "pro" : "free");
  const priceUsed = alerts.filter((alert) => alert.kind === "price_threshold").length;
  const inZone = positions.filter((position) => position.needsAttention && position.stance);
  // One row per stock, its alerts closest to firing first; an alert whose condition already holds leads.
  const groups = groupAlerts(alerts, (alert) => priceById.get(alert.instrument_id));

  if (example) {
    return (
      <div className={CARD}>
        <EmptyNote title="Alerts live with your own portfolio">
          Set a price level on any stock, get an email the day before it reports, and get told when our call on it
          changes. Sign in and add a stock to set one.
        </EmptyNote>
      </div>
    );
  }

  async function remove(alert: PortfolioAlert) {
    setRemoving(alert.id);
    setError(null);
    const result = await deleteStockAlert(alert.id);
    setRemoving(null);
    if (result.ok) setAlerts((current) => current.filter((item) => item.id !== alert.id));
    else setError(result.error);
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const position = positions.find((item) => item.instrument_id === form.id);
    const target = Number(form.price.replace(/[$,\s]/g, ""));
    if (!position) return setError("Pick a stock.");
    if (!Number.isFinite(target) || target <= 0) return setError("Enter a price above zero.");
    setCreating(true);
    const result = await createStockAlert({
      instrument_id: position.instrument_id,
      ticker: position.ticker,
      kind: "price_threshold",
      condition: form.condition,
      target_price: target,
    });
    setCreating(false);
    if (!result.ok) return setError(result.error);
    if (result.alreadyExists) return setNotice("You already have that alert.");
    setAlerts((current) => [
      {
        id: result.alertId ?? `new-${Date.now()}`,
        ticker: position.ticker,
        instrument_id: position.instrument_id,
        kind: "price_threshold",
        condition: form.condition,
        target_price: target,
        created_at: new Date().toISOString(),
        note: null,
      },
      ...current,
    ]);
    setForm((current) => ({ ...current, price: "" }));
    setNotice(`Alert set. We email you when ${position.ticker} trades ${form.condition} ${fmtMoney(target)}.`);
  }

  const field = `h-8 rounded border border-oa-border bg-oa-card px-2 text-[13px] text-oa-fg ${FOCUS}`;

  return (
    <div className="flex flex-col gap-3">
      <section className={CARD} aria-label="Your alerts">
        <SectionTitle aside={`${alerts.length} active`}>Your alerts</SectionTitle>
        {alerts.length === 0 ? (
          <EmptyNote title="No alerts set">
            {isSubscribed
              ? "Add a price level below, or set earnings and call-change alerts from any stock page."
              : `Free keeps ${priceLimit} price alerts: an email when a price you set is crossed. Earnings and call-change alerts are part of Pro.`}
          </EmptyNote>
        ) : (
          // About eight stocks show; the rest scroll inside with no scrollbar, the title above stays put, and the page
          // takes the scroll back at the end (owner rule 5).
          <WholeRows rem={26} className="scrollbar-hide max-h-[26rem] overflow-y-auto">
            <ul className="divide-y divide-oa-border">
              {groups.map((group) => (
                <li key={group.ticker} data-row className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-2 px-3 hover:bg-oa-accent sm:grid-cols-[5.75rem_minmax(0,1fr)] sm:gap-x-3">
                  <Link
                    href={`/stock/${group.ticker}`}
                    className="oa-mono inline-flex min-h-11 items-center gap-1.5 self-start text-[13px] font-medium text-oa-fg hover:underline"
                  >
                    <StockLogo ticker={group.ticker} size={18} />
                    {group.ticker}
                  </Link>
                  <ul className="min-w-0">
                    {group.alerts.map(({ alert, distance }) => {
                      const price = priceById.get(alert.instrument_id) ?? null;
                      return (
                        <li key={alert.id} className="group grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-1.5">
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] leading-5 text-oa-fg">{describe(alert)}</p>
                            <p className="oa-mono text-[11px] leading-4 text-oa-muted-fg sm:truncate">
                              {distance && price ? (
                                distance.met ? (
                                  // The condition is already true: say so, not a distance to a level it has passed.
                                  <>
                                    now {fmtMoney(price)}, <span className="font-medium text-oa-primary">already {distance.condition}</span>
                                  </>
                                ) : (
                                  <>
                                    now {fmtMoney(price)}, <Pct value={distance.pct} digits={1} className="!text-oa-muted-fg" /> away
                                  </>
                                )
                              ) : null}
                              {distance && alert.created_at ? " · " : null}
                              {alert.created_at ? `set ${fmtDay(alert.created_at)}` : null}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void remove(alert)}
                            disabled={removing === alert.id}
                            aria-label={`Remove the ${alert.ticker} alert: ${describe(alert)}`}
                            // Not on every row at rest (owner rule 1): it shows on the line under the pointer, or when focused.
                            // A touch screen has no hover, so there it stays in view.
                            className={`rounded border border-oa-border px-2 py-1 text-[12px] font-medium text-oa-muted-fg hover:text-signal-bearish disabled:opacity-50 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100 ${removing === alert.id ? "!opacity-100" : ""} ${FOCUS}`}
                          >
                            {removing === alert.id ? "Removing" : "Remove"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </WholeRows>
        )}
        {positions.length > 0 ? (
          <form onSubmit={(event) => void create(event)} className="flex flex-wrap items-end gap-2 border-t border-oa-border bg-oa-bg px-3 py-3">
            <label className="flex flex-col gap-1">
              <span className="oa-caption">Stock</span>
              <select value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} className={`${field} oa-mono`}>
                {positions.map((position) => (
                  <option key={position.instrument_id} value={position.instrument_id}>
                    {position.ticker}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="oa-caption">When price is</span>
              <select
                value={form.condition}
                onChange={(event) => setForm({ ...form, condition: event.target.value === "above" ? "above" : "below" })}
                className={field}
              >
                <option value="below">below</option>
                <option value="above">above</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="oa-caption">Price</span>
              <input
                inputMode="decimal"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
                placeholder={(() => {
                  const price = priceById.get(form.id);
                  return price ? price.toFixed(2) : "0.00";
                })()}
                className={`${field} ${NUM} w-28`}
                aria-label="Alert price"
              />
            </label>
            <button
              type="submit"
              disabled={creating}
              className={`inline-flex h-8 items-center rounded border border-oa-primary bg-oa-primary px-3 text-[12.5px] font-medium text-oa-primary-fg hover:brightness-110 disabled:opacity-50 ${FOCUS}`}
            >
              {creating ? "Setting" : "Set price alert"}
            </button>
            {!isSubscribed && Number.isFinite(priceLimit) ? (
              <span className="oa-mono text-[11.5px] text-oa-muted-fg">
                {Math.max(0, priceLimit - priceUsed)} of {priceLimit} free price alerts left.{" "}
                <Link href="/pricing#price_alerts" className="font-sans font-medium text-oa-fg underline underline-offset-2">
                  Pro keeps more
                </Link>
              </span>
            ) : null}
          </form>
        ) : null}
        {error || notice ? (
          <p role={error ? "alert" : "status"} className={`border-t border-oa-border px-3 py-2 text-[12.5px] ${error ? "text-signal-bearish" : "text-oa-fg"}`}>
            {error ?? notice}
          </p>
        ) : null}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className={CARD} aria-label="Calls in their zone">
          <SectionTitle aside={`${inZone.length}`}>Price is inside our call&apos;s zone now</SectionTitle>
          {inZone.length === 0 ? (
            <EmptyNote title="Nothing is in its zone right now" />
          ) : (
            // About eight rows, the rest scroll inside on whole rows, handing the scroll back to the page (owner rule 5).
            <WholeRows rem={22} className="scrollbar-hide max-h-[22rem] overflow-y-auto">
            <ul className="divide-y divide-oa-border">
              {inZone.map((position) => (
                <li key={position.instrument_id}>
                  <Link href={`/stock/${position.ticker}`} className="grid min-h-10 grid-cols-[5.75rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-1.5 hover:bg-oa-accent">
                    <span className="oa-mono inline-flex items-center gap-1.5 text-[13px] font-medium text-oa-fg">
                      <StockLogo ticker={position.ticker} size={18} />
                      {position.ticker}
                    </span>
                    <span className="truncate text-[13px] text-oa-fg">
                      <span>{plainCallWord(position.stance)}</span>
                      {position.zone ? <span className="text-oa-muted-fg"> · {position.zone.label}</span> : null}
                    </span>
                    <span className={`${NUM} text-[12.5px] text-oa-fg`}>{position.price !== null ? fmtMoney(position.price) : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
            </WholeRows>
          )}
        </section>

        <section className={CARD} aria-label="Signals on your stocks">
          <SectionTitle aside={`${signals.length}`}>Flags on your stocks</SectionTitle>
          {signals.length === 0 ? (
            <EmptyNote title="No flags on your stocks today" />
          ) : (
            // Every flag, about eight in view and the rest scrolling inside, the same height as the zone list beside it.
            <WholeRows rem={22} className="scrollbar-hide max-h-[22rem] overflow-y-auto">
            <ul className="divide-y divide-oa-border">
              {signals.map((signal, index) => (
                <li key={`${signal.ticker}-${index}`}>
                  <Link href={`/stock/${signal.ticker}`} className="grid min-h-10 grid-cols-[5.75rem_minmax(0,1fr)] items-start gap-x-3 px-3 py-2 hover:bg-oa-accent">
                    <span className="oa-mono inline-flex items-center gap-1.5 text-[13px] font-medium leading-5 text-oa-fg">
                      <StockLogo ticker={signal.ticker} size={18} />
                      {signal.ticker}
                    </span>
                    <span className="min-w-0 text-[13px] leading-5 text-oa-fg">
                      {/* The words stay in normal ink; the mark in front says good or bad for the stock, in a fixed slot so the titles line up. */}
                      <MarkSlot tone={signal.tone === "bull" ? "up" : signal.tone === "bear" ? "down" : null} className="mr-1.5 -mt-px align-middle" />
                      <span className="font-medium">{signal.title}</span>
                      {signal.body ? <span className="text-oa-muted-fg"> {signal.body}</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            </WholeRows>
          )}
        </section>
      </div>

      {emailPrefs ? (
        <section className={CARD} aria-label="Email preferences">
          <SectionTitle
            aside={
              <Link href="/profile" className="hover:text-oa-fg">
                Profile →
              </Link>
            }
          >
            Email
          </SectionTitle>
          <div className="divide-y divide-oa-border px-3 py-1">
            <PreferenceToggle
              field="email_alerts_enabled"
              label="Alerts"
              description="Price levels you set, earnings the next day, and flags on the stocks you track."
              initialValue={emailPrefs.alerts}
            />
            <PreferenceToggle
              field="email_digest_enabled"
              label="Market briefs"
              description="Short updates before the open, after the close, and each week."
              initialValue={emailPrefs.digest}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
