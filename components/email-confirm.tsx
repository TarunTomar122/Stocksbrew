"use client";

import Link from "next/link";
import * as React from "react";

import { whenLine } from "@/lib/email-capture-copy";
import { FREE_COVERED_STOCKS } from "@/lib/paywall-flag";
import { captureEvent } from "@/lib/posthog";

type State = { kind: "working" } | { kind: "done"; first: boolean; tickers: string[] } | { kind: "linked" } | { kind: "error"; gone: boolean };

const TITLE = "text-balance text-[19px] font-semibold leading-6 tracking-[-0.01em] text-oa-fg sm:text-[22px] sm:leading-7";
const LEDE = "mt-1 max-w-4xl text-pretty text-[14px] leading-5 text-oa-muted-fg";
const LINK = "text-[14px] font-semibold text-oa-primary underline-offset-2 hover:underline";

/**
 * Confirms the morning email from the browser (POST /api/email/subscribe/confirm) and says what comes next.
 * `email_confirmed` goes to the first-party analytics once, on the first confirmation (not on a reload).
 */
export function ConfirmSubscription({ id, token }: { id: string; token: string }) {
  const [state, setState] = React.useState<State>({ kind: "working" });
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/email/subscribe/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ s: id, t: token }),
        });
        const body = (await res.json().catch(() => ({}))) as { state?: string; tickers?: unknown };
        const tickers = Array.isArray(body.tickers) ? body.tickers.filter((t): t is string => typeof t === "string") : [];
        if (res.ok && body.state === "linked") setState({ kind: "linked" });
        else if (res.ok && (body.state === "confirmed" || body.state === "already")) {
          if (body.state === "confirmed") captureEvent("email_confirmed");
          setState({ kind: "done", first: body.state === "confirmed", tickers });
        } else setState({ kind: "error", gone: res.status === 404 });
      } catch {
        setState({ kind: "error", gone: false });
      }
    })();
  }, [id, token]);

  if (state.kind === "working") {
    return (
      <header className="px-2 sm:px-0" aria-live="polite">
        <h1 className={TITLE}>Confirming your email…</h1>
      </header>
    );
  }
  if (state.kind === "linked") {
    return (
      <header className="px-2 sm:px-0">
        <h1 className={TITLE}>Your account already gets this email</h1>
        <p className={LEDE}>Choose what we send in your email settings.</p>
        <Link href="/profile#notifications" className={`${LINK} mt-4 inline-block`}>
          Open email settings
        </Link>
      </header>
    );
  }
  if (state.kind === "error") {
    return (
      <header className="px-2 sm:px-0">
        <h1 className={TITLE}>{state.gone ? "We couldn't find that signup" : "That didn't work"}</h1>
        <p className={LEDE}>{state.gone ? "Sign up again on any stock page." : "Reload the page to try again."}</p>
      </header>
    );
  }
  const picks = state.tickers.slice(0, FREE_COVERED_STOCKS);
  return (
    <header className="px-2 sm:px-0">
      <h1 className={TITLE}>{state.first ? "You're in" : "You're already in"}</h1>
      <p className={LEDE}>{whenLine(state.tickers)}</p>
      <Link href={picks.length ? `/?try=${picks.join(",")}` : "/"} className={`${LINK} mt-4 inline-block`}>
        Make it yours: pick {FREE_COVERED_STOCKS} stocks free
      </Link>
    </header>
  );
}
