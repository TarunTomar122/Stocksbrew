"use client";

import * as React from "react";

import { useUser } from "@/lib/auth-context";
import { SENT_COPY, capturePromise } from "@/lib/email-capture-copy";
import type { CaptureSource } from "@/lib/email-subscribers";
import { captureEvent } from "@/lib/posthog";

/**
 * The no-account morning email: one quiet strip with one line of promise, one email field and one button
 * (POST /api/email/subscribe, double opt-in). On a ticker page it signs the visitor up for that stock; a second ticker
 * page adds to the same signup. The words are lib/email-capture-copy.ts's, shared with the confirmation email.
 *
 * Signed-in visitors never see it: their account already gets the morning email, under their own settings. The
 * server's session cookie decides it on the first paint (initialAuthed), so it never flashes for them.
 */

type Status = "idle" | "sending" | "sent" | "error";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
const FIELD = `h-9 min-w-0 flex-1 rounded-md border border-oa-border bg-oa-card px-3 text-[14px] text-oa-fg placeholder:text-oa-muted-fg sm:w-60 sm:flex-none ${FOCUS}`;

function MailIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`size-4 shrink-0 ${className}`} aria-hidden>
      <path d="M3 5.5h14v9H3zM3.5 6 10 11l6.5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 shrink-0" aria-hidden>
      <path d="m5 10.5 3.2 3L15 6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EmailCapture({ source, ticker, className = "" }: { source: CaptureSource; ticker?: string; className?: string }) {
  const { user, initialAuthed } = useUser();
  const [status, setStatus] = React.useState<Status>("idle");
  const [error, setError] = React.useState("");
  // The button waits for the page to hydrate: a form sent before then would go without the script (and never with
  // the address in a URL: the form posts, it never GETs).
  const [ready, setReady] = React.useState(false);
  const shownAt = React.useRef(0);
  const fieldId = React.useId();
  const promise = capturePromise(ticker);

  React.useEffect(() => {
    shownAt.current = Date.now();
    setReady(true);
  }, []);

  if (initialAuthed || user) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    const form = new FormData(event.currentTarget);
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/email/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({
          email: String(form.get("email") ?? ""),
          // The honeypot: people never see or fill it.
          website: String(form.get("website") ?? ""),
          source,
          ticker: ticker ?? null,
          ms: shownAt.current ? Date.now() - shownAt.current : null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        setStatus("sent");
        captureEvent("email_captured", { kind: source });
        return;
      }
      setStatus("error");
      setError(
        body.error === "email"
          ? "That email doesn't look right."
          : res.status === 429
            ? "Too many tries. Give it a minute."
            : "That didn't work. Try again.",
      );
    } catch {
      setStatus("error");
      setError("That didn't work. Try again.");
    }
  }

  return (
    <section
      aria-label={promise}
      className={`oa-surface flex flex-col gap-2 border border-oa-border bg-oa-card px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 ${className}`}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="flex items-center gap-2 text-[14.5px] font-medium leading-5 text-oa-fg">
          <MailIcon className="text-oa-primary" />
          {promise}
        </p>
        {error ? (
          <p id={`${fieldId}-error`} role="alert" className="text-[13px] leading-4 text-[color:var(--signal-bearish)]">
            {error}
          </p>
        ) : null}
      </div>
      {status === "sent" ? (
        <p role="status" className="flex min-h-9 items-center gap-1.5 text-[14px] font-medium text-oa-fg">
          <span className="text-[color:var(--signal-bullish)]">
            <CheckIcon />
          </span>
          {SENT_COPY}
        </p>
      ) : (
        <form onSubmit={submit} method="post" action="/api/email/subscribe" className="relative flex w-full items-center gap-2 sm:w-auto">
          <div aria-hidden className="absolute -left-[9999px] top-auto size-px overflow-hidden">
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
            </label>
          </div>
          <label htmlFor={fieldId} className="sr-only">
            Your email
          </label>
          <input
            id={fieldId}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="Your email"
            aria-invalid={status === "error" ? true : undefined}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            className={FIELD}
          />
          <button
            type="submit"
            disabled={!ready || status === "sending"}
            className={`inline-flex h-9 shrink-0 items-center rounded-md bg-oa-primary px-3.5 text-[13.5px] font-semibold text-oa-primary-fg transition-opacity hover:opacity-95 disabled:opacity-60 ${FOCUS}`}
          >
            Email me
          </button>
        </form>
      )}
    </section>
  );
}
