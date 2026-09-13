"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AnimatedIcon } from "@/components/animated-icon";
import { CountdownClock } from "@/components/countdown-clock";
import { formatNextOpenLabel, getMarketSessionState } from "@/lib/market-session";
import {
  getMarketStatusBannerCopy,
  marketStatusStateLabel,
  type MarketStatusSurface,
} from "@/lib/market-status-copy";
import { captureEvent } from "@/lib/posthog";

const TILT_MAX_DEG = 3.5;

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
  const [tiltEnabled, setTiltEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const session = getMarketSessionState(new Date(nowMs));
  const copy = getMarketStatusBannerCopy(session);
  const needsTick = Boolean(copy) && session.kind !== "open";
  const { poked, poke } = usePokeQuip(copy?.quip);

  useEffect(() => {
    setNowMs(Date.now());
    const hoverFine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTiltEnabled(hoverFine && !reduced);
  }, []);

  useEffect(() => {
    if (!needsTick) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [needsTick]);

  useEffect(() => {
    if (!copy) return;
    trackImpression(surface, copy.state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copy?.state, surface]);

  const handleMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!tiltEnabled) return;
      const card = cardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const py = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      card.style.setProperty("--tilt-ry", `${(px - 0.5) * 2 * TILT_MAX_DEG}deg`);
      card.style.setProperty("--tilt-rx", `${(0.5 - py) * 2 * TILT_MAX_DEG}deg`);
      card.style.setProperty("--tilt-gx", `${px * 100}%`);
      card.style.setProperty("--tilt-gy", `${py * 100}%`);
    },
    [tiltEnabled],
  );

  const resetTilt = useCallback(() => {
    setHovering(false);
    const card = cardRef.current;
    if (!card) return;
    card.classList.remove("is-tilting");
    card.style.setProperty("--tilt-rx", "0deg");
    card.style.setProperty("--tilt-ry", "0deg");
  }, []);

  if (!copy) return null;

  const destination = copy.cta.external ? "yourtrace_feed" : copy.cta.href;
  const iconName = session.kind === "premarket" ? "sun" : "sun-moon";
  const countdownMs = session.msToOpen;
  const showClock = session.kind === "weekend" || session.kind === "holiday" || session.kind === "afterhours";
  const headline = poked && copy.quip ? copy.quip : copy.headline;

  return (
    <div
      className={`t-tilt ${hovering ? "is-hover" : ""} ${className ?? ""}`}
      onPointerMove={handleMove}
      onPointerEnter={() => {
        setHovering(true);
        if (tiltEnabled) cardRef.current?.classList.add("is-tilting");
      }}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
    >
      <div
        ref={cardRef}
        className="t-tilt-card flex flex-col gap-4 rounded-[18px] border border-oa-border bg-oa-card px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:py-5"
      >
        <div className="t-tilt-glare" aria-hidden />

        {copy.quip ? (
          <button
            type="button"
            onClick={poke}
            aria-label="One more thing"
            className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-full border border-oa-border bg-oa-bg text-oa-fg transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transform-none active:translate-y-0"
          >
            <AnimatedIcon name={iconName} size={24} />
          </button>
        ) : (
          <div
            aria-hidden
            className="grid size-12 shrink-0 place-items-center rounded-full border border-oa-border bg-oa-bg text-oa-fg"
          >
            <AnimatedIcon name={iconName} size={24} />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <span className="t-stagger t-stagger-enter">
            <span className="t-stagger-line">
              <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="rounded-full bg-oa-accent px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-oa-muted-fg">
                  {copy.badge}
                </span>
                <span className="text-[16px] font-medium text-oa-fg sm:text-[17px]">{headline}</span>
              </span>
            </span>
            {showClock ? (
              <span className="t-stagger-line t-stagger-line--2 mt-3">
                <span className="flex flex-wrap items-center gap-3">
                  <CountdownClock msLeft={countdownMs} />
                  <span className="hidden text-[12px] text-oa-muted-fg sm:inline">
                    Next open: {formatNextOpenLabel(new Date(nowMs))}
                  </span>
                </span>
              </span>
            ) : null}
          </span>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {copy.cta.external ? (
            <a
              href={copy.cta.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackCta(surface, copy.state, destination)}
              className="group inline-flex h-10 items-center gap-2 rounded-full bg-oa-primary px-4 text-[13px] font-medium text-oa-primary-fg transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transform-none active:translate-y-0"
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
              onClick={() => trackCta(surface, copy.state, destination)}
              className="group inline-flex h-10 items-center gap-2 rounded-full bg-oa-primary px-4 text-[13px] font-medium text-oa-primary-fg transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transform-none active:translate-y-0"
            >
              {copy.cta.label}
              <span className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>
                →
              </span>
            </Link>
          )}
        </div>
      </div>
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

  let text: string;
  if (session.kind === "open") {
    text = "Market open";
  } else if (session.kind === "premarket") {
    text = `Opens in ${session.countdown}`;
  } else if (session.kind === "afterhours") {
    text = "After hours";
  } else if (session.kind === "holiday") {
    text = `Closed for ${session.holidayName ?? "the holiday"}`;
  } else {
    text = "Market closed";
  }

  const open = session.kind === "open";

  return (
    <span className={`t-tt-wrap ${className ?? ""}`}>
      <span
        tabIndex={0}
        aria-describedby={`market-status-tip-${surface}`}
        className="t-tt-trigger inline-flex cursor-default items-center gap-1.5 rounded-full border border-oa-border bg-oa-card px-2.5 py-1 text-[11px] font-medium text-oa-muted-fg"
      >
        <span aria-hidden className="relative flex size-2 shrink-0">
          {open ? (
            <>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: "var(--signal-bullish)" }} />
              <span className="relative inline-flex size-2 rounded-full" style={{ background: "var(--signal-bullish)" }} />
            </>
          ) : (
            <span className="relative inline-flex size-2 rounded-full bg-oa-muted-fg/60" />
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
