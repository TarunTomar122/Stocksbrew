"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AnimatedIcon } from "@/components/animated-icon";
import { CountdownClock } from "@/components/countdown-clock";
import {
  countdownTickMs,
  formatNextOpenLabel,
  formatNextOpenPhrase,
  getMarketSessionState,
} from "@/lib/market-session";
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

function usePokeQuip(quip?: string) {
  const [poked, setPoked] = useState(false);
  const timer = useRef<number | null>(null);

  const poke = useCallback(() => {
    if (!quip) return;
    setPoked(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPoked(false), 3600);
  }, [quip]);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  return { poked, poke };
}

/**
 * Floating bottom tab: collapsed pill on every page, expands into the full
 * market-status card. Hidden entirely while the regular session is live.
 */
export function MarketStatusTab({ nowIso }: { nowIso: string }) {
  const [nowMs, setNowMs] = useState(() => parseNowMs(nowIso));
  const [open, setOpen] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  const session = getMarketSessionState(new Date(nowMs));
  const copy = getMarketStatusBannerCopy(session);
  const needsTick = Boolean(copy) && session.kind !== "open";
  const tickMs = countdownTickMs(session.msToOpen, open);
  const requiresLift = Boolean(pathname?.startsWith("/watchlist"));
  const { poked, poke } = usePokeQuip(copy?.quip);

  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  useEffect(() => {
    if (!needsTick) return;
    const id = window.setInterval(() => setNowMs(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [needsTick, tickMs]);

  useEffect(() => {
    if (!copy) return;
    trackImpression("floating", copy.state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copy?.state]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (paneRef.current && !paneRef.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  if (!copy) return null;

  const destination = copy.cta.external ? "yourtrace_feed" : copy.cta.href;
  const iconName = session.kind === "premarket" ? "sun" : "sun-moon";
  const showClock = session.kind === "weekend" || session.kind === "holiday" || session.kind === "afterhours";
  const headline = poked && copy.quip ? copy.quip : copy.headline;

  const ctaClass =
    "group inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-oa-primary px-4 text-[13px] font-medium text-oa-primary-fg transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transform-none active:translate-y-0";
  const cta = copy.cta.external ? (
    <a
      href={copy.cta.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackCta("floating", copy.state, destination)}
      className={`${ctaClass} w-full sm:w-auto`}
    >
      {copy.cta.label}
      <span className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>
        →
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : (
    <Link
      href={copy.cta.href}
      onClick={() => trackCta("floating", copy.state, destination)}
      className={`${ctaClass} w-full sm:w-auto`}
    >
      {copy.cta.label}
      <span className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>
        →
      </span>
    </Link>
  );

  return (
    <div
      ref={paneRef}
      className={`oa-app fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-[60] w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 ${
        requiresLift ? "sm:bottom-24" : "sm:bottom-6"
      }`}
    >
      <div className="t-acc" data-open={open ? "true" : "false"}>
        <div id="market-status-panel" className="t-acc-panel" role="region" aria-label="Market status">
          <div className="t-acc-panel-inner">
            <div className="mb-2.5 w-[min(34rem,calc(100vw-2rem))] rounded-[22px] border border-oa-border bg-oa-card p-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)] sm:p-5">
              <div className="flex items-start gap-4">
                {copy.quip ? (
                  <button
                    type="button"
                    onClick={poke}
                    aria-label="One more thing"
                    className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border border-oa-border bg-oa-bg text-oa-fg transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transform-none active:translate-y-0"
                  >
                    <AnimatedIcon name={iconName} size={22} />
                  </button>
                ) : (
                  <div
                    aria-hidden
                    className="grid size-11 shrink-0 place-items-center rounded-full border border-oa-border bg-oa-bg text-oa-fg"
                  >
                    <AnimatedIcon name={iconName} size={22} />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <span className="rounded-full bg-oa-accent px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-oa-muted-fg">
                    {copy.badge}
                  </span>
                  <p className="mt-2 text-[16px] font-medium leading-snug text-oa-fg sm:text-[17px]">
                    {headline}
                  </p>

                  {showClock ? (
                    <div className="mt-4">
                      <CountdownClock msLeft={session.msToOpen} />
                      <p className="mt-2.5 text-[12.5px] text-oa-muted-fg">
                        Market opens {formatNextOpenPhrase(new Date(nowMs))}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-5">{cta}</div>
                </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls="market-status-panel"
          className="mx-auto flex h-11 cursor-pointer items-center gap-2.5 rounded-full border border-oa-border bg-oa-card px-3.5 text-[12.5px] font-medium text-oa-fg shadow-[0_10px_30px_rgba(15,23,42,0.16)] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transform-none active:translate-y-0"
        >
          <AnimatedIcon name={iconName} size={15} />
          <span>
            Market opens in <span className="oa-mono tabular-nums">{session.countdown}</span>
          </span>
          <span
            aria-hidden
            className={`text-oa-muted-fg transition-transform duration-200 ${open ? "" : "rotate-180"}`}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path
                d="M3.5 6 8 10.5 12.5 6"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
      </div>
  );
}

/** Compact chip for stock headers: pulsing dot + tooltip with the next open. */
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
  const tickMs = countdownTickMs(session.msToOpen);

  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  useEffect(() => {
    if (!needsTick) return;
    const id = window.setInterval(() => setNowMs(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [needsTick, tickMs]);

  useEffect(() => {
    trackImpression(surface, marketStatusStateLabel(session));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.kind, surface]);

  let text: string;
  if (session.kind === "open") {
    text = "Market open";
  } else if (session.kind === "premarket") {
    text = `Opens in ${session.countdown}`;
  } else if (session.kind === "afterhours") {
    text = `After hours · opens in ${session.countdown}`;
  } else if (session.kind === "holiday") {
    text = `Closed for ${session.holidayName ?? "the holiday"} · opens in ${session.countdown}`;
  } else {
    text = `Market closed · opens in ${session.countdown}`;
  }

  const open = session.kind === "open";

  return (
    <span className={`t-tt-wrap ${className ?? ""}`}>
      <span
        tabIndex={0}
        aria-describedby={`market-status-tip-${surface}`}
        className="t-tt-trigger inline-flex cursor-default items-center gap-1.5 rounded-full border border-oa-border bg-oa-card px-2.5 py-1 text-[11px] font-medium text-oa-fg/75"
      >
        <span aria-hidden className="relative flex size-2 shrink-0">
          {open ? (
            <>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: "var(--signal-bullish)" }} />
              <span className="relative inline-flex size-2 rounded-full" style={{ background: "var(--signal-bullish)" }} />
            </>
          ) : (
            <span className="relative inline-flex size-2 rounded-full bg-oa-muted-fg" />
          )}
        </span>
        <AnimatedIcon name={open ? "sun" : "sun-moon"} size={13} />
        {text}
      </span>
      <span id={`market-status-tip-${surface}`} role="tooltip" className="t-tt">
        {open ? "Regular session is live" : `Next open: ${formatNextOpenLabel(new Date(nowMs))}`}
      </span>
    </span>
  );
}
