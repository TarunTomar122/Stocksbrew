"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getMarketSessionState } from "@/lib/market-session";
import {
  getMarketStatusBannerCopy,
  marketStatusStateLabel,
  type MarketStatusSurface,
} from "@/lib/market-status-copy";
import { captureEvent } from "@/lib/posthog";

function parseNowMs(nowIso: string): number {
  const parsed = new Date(nowIso).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function trackCta(surface: MarketStatusSurface, state: string, destination: string) {
  captureEvent("market_status_cta_clicked", { surface, state, destination });
}

function trackImpression(surface: MarketStatusSurface, state: string) {
  captureEvent("market_status_impression", { surface, state });
}

export function MarketStatusBanner({
  nowIso,
  surface,
  className,
}: {
  nowIso: string;
  surface: MarketStatusSurface;
  className?: string;
}) {
  const [nowMs, setNowMs] = useState(() => parseNowMs(nowIso));
  const session = getMarketSessionState(new Date(nowMs));
  const copy = getMarketStatusBannerCopy(session);
  const needsTick = session.kind === "premarket" || session.kind === "weekend" || session.kind === "holiday";

  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  useEffect(() => {
    if (!needsTick) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [needsTick]);

  useEffect(() => {
    if (!copy) return;
    trackImpression(surface, copy.state);
    // Once per mount per state; a session flip is a new mount-level state worth one event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copy?.state, surface]);

  if (!copy) return null;

  const destination = copy.cta.external ? "yourtrace_feed" : copy.cta.href;
  const ctaClass =
    "font-medium text-oa-fg underline decoration-oa-border decoration-1 underline-offset-4 transition-colors hover:decoration-oa-fg";
  const cta = copy.cta.external ? (
    <a
      href={copy.cta.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackCta(surface, copy.state, destination)}
      className={ctaClass}
    >
      {copy.cta.label} →
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : (
    <Link href={copy.cta.href} onClick={() => trackCta(surface, copy.state, destination)} className={ctaClass}>
      {copy.cta.label} →
    </Link>
  );

  return (
    <div
      className={`flex flex-col gap-2 rounded-[16px] border border-oa-border bg-oa-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5 ${className ?? ""}`}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="rounded-full bg-oa-accent px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-oa-muted-fg">
          {copy.badge}
        </span>
        <span className="text-[15px] font-medium text-oa-fg">{copy.headline}</span>
      </div>
      <span className="shrink-0 text-[13px] text-oa-muted-fg">{cta}</span>
    </div>
  );
}

export function MarketStatusInline({
  nowIso,
  surface,
  className,
}: {
  nowIso: string;
  surface: MarketStatusSurface;
  className?: string;
}) {
  const [nowMs, setNowMs] = useState(() => parseNowMs(nowIso));
  const session = getMarketSessionState(new Date(nowMs));
  const needsTick = session.kind !== "open";

  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  useEffect(() => {
    if (!needsTick) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [needsTick]);

  useEffect(() => {
    trackImpression(surface, marketStatusStateLabel(session));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.kind, surface]);

  let text: string | null = null;
  if (session.kind === "open") {
    text = "Market open";
  } else if (session.kind === "premarket") {
    text = `Pre-market · opens in ${session.countdown}`;
  } else if (session.kind === "afterhours") {
    text = "After hours · regular session closed at 4:00 PM ET";
  } else if (session.kind === "holiday") {
    text = `Closed for ${session.holidayName ?? "the holiday"} · opens in ${session.countdown}`;
  } else {
    text = `Market closed · opens in ${session.countdown}`;
  }

  return (
    <p
      className={`flex items-center gap-1.5 text-[12px] ${className ?? ""}`}
      style={{ color: session.kind === "open" ? "var(--signal-bullish)" : "var(--oa-muted-fg)" }}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: session.kind === "open" ? "var(--signal-bullish)" : "var(--oa-muted-fg)" }}
      />
      {text}
    </p>
  );
}
