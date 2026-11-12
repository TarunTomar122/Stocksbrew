"use client";

import { useEffect, useRef, useState } from "react";

import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import { fundAddingView, type FundAddingStep, type FundKind, type FundRequestState } from "@/lib/funds/adding";

/** How often the page asks whether the fund is in, and when it stops asking and says it is slow. */
const POLL_MS = 20_000;
const SLOW_AFTER_MS = 20 * 60_000;
const RELOAD_KEY = "fund-ready-reload:";

type Reply = { fundState?: FundRequestState };

/**
 * /stock/<FUND> for a US fund we do not cover yet: says we are adding it, files
 * the request (once; the API never re-queues a fund on its way), and checks
 * every 20 seconds. Once the worker has covered it the page reloads into the
 * fund page. Nothing here is a number we do not have.
 */
export function FundAdding({
  ticker,
  kind,
  initial,
  isTracked,
  subscribed,
}: {
  ticker: string;
  kind: FundKind;
  /** The request's state when the page was rendered. */
  initial: FundRequestState;
  isTracked: boolean;
  subscribed: boolean;
}) {
  const [step, setStep] = useState<FundAddingStep>(initial === "none" ? "adding" : initial);
  const started = useRef(Date.now());

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function done(next: FundAddingStep) {
      if (stopped) return;
      setStep(next);
      if (next !== "ready") return;
      // Reload once into the fund page. A second "ready" inside two minutes means the cached page has not
      // turned over yet: the button below does it instead of a reload loop.
      let last = 0;
      try {
        last = Number(window.sessionStorage.getItem(RELOAD_KEY + ticker) || 0);
        window.sessionStorage.setItem(RELOAD_KEY + ticker, String(Date.now()));
      } catch {
        // storage blocked: fall back to the button
        last = Date.now();
      }
      if (Date.now() - last > 120_000) window.location.reload();
    }

    async function check() {
      const reply = (await fetch(`/api/stock-request?query=${encodeURIComponent(ticker)}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null)) as Reply | null;
      const state = reply?.fundState;
      if (state === "ready" || state === "not_found") return done(state);
      if (state === "none") {
        // The request was never filed (or the first post failed): file it now.
        await file();
        if (stopped) return;
      }
      if (Date.now() - started.current > SLOW_AFTER_MS) return done("slow");
      timer = setTimeout(check, POLL_MS);
    }

    async function file() {
      const reply = (await fetch("/api/stock-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: ticker, source: "page" }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null)) as Reply | null;
      if (!reply) return done("error");
      if (reply.fundState === "ready" || reply.fundState === "not_found") return done(reply.fundState);
    }

    if (initial === "ready" || initial === "not_found") {
      done(initial);
    } else if (initial === "none") {
      void file().then(() => {
        if (!stopped) timer = setTimeout(check, POLL_MS);
      });
    } else {
      timer = setTimeout(check, POLL_MS);
    }
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [ticker, initial]);

  const view = fundAddingView(ticker, kind, step);
  const busy = step === "adding" || step === "none";

  return (
    <div className="mx-auto w-full max-w-[40rem] px-4 pb-[72px] pt-6 sm:px-6 sm:pt-10">
      <section className="oa-surface border border-oa-border bg-oa-card px-4 py-4 text-oa-fg sm:px-5 sm:py-5" aria-live="polite">
        <div className="flex min-w-0 items-start gap-3">
          <StockLogo ticker={ticker} market="US" size={40} eager />
          <div className="min-w-0 flex-1">
            <h1 className="text-pretty text-[20px] font-semibold leading-7 tracking-tight text-oa-fg sm:text-[22px]">{view.title}</h1>
            {view.line ? <p className="mt-0.5 text-pretty text-[14px] leading-5 text-oa-muted-fg">{view.line}</p> : null}
          </div>
        </div>
        {busy ? (
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-oa-accent" role="progressbar" aria-label={`Adding ${ticker}`}>
            <div className="h-full w-1/3 animate-[fund-adding_1.6s_ease-in-out_infinite] rounded-full bg-oa-primary motion-reduce:animate-none" />
          </div>
        ) : null}
        <div className={`mt-4 flex flex-wrap items-center gap-2 ${view.tone === "missing" ? "hidden" : ""}`}>
          {view.tone === "done" ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-9 items-center rounded-md bg-oa-primary px-3.5 text-[14px] font-medium text-oa-primary-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oa-ring"
            >
              Open {ticker}
            </button>
          ) : view.tone === "missing" ? null : view.tone === "error" ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-9 items-center rounded-md bg-oa-primary px-3.5 text-[14px] font-medium text-oa-primary-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oa-ring"
            >
              Try again
            </button>
          ) : (
            <div className="oa-track-outline">
              <TrackButton
                ticker={ticker}
                instrumentId={`US_${ticker}`}
                isSubscribed={subscribed}
                isTracked={isTracked}
                untrackedLabel={`+ Follow ${ticker}`}
                signedOutLabel={`+ Follow ${ticker}`}
              />
            </div>
          )}
        </div>
      </section>
      <style>{"@keyframes fund-adding{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}"}</style>
    </div>
  );
}
