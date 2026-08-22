"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useState } from "react";

import { captureEvent } from "@/lib/posthog";

const POP = { type: "spring", stiffness: 400, damping: 26 } as const;
const POP_EXIT = { type: "spring", stiffness: 380, damping: 28 } as const;

type Props = {
  query: string;
  onClose: () => void;
};

/** The stock request confirmation. Pops in at POP, exits softer at
 *  POP_EXIT; the backdrop is a plain fade and clicking it closes. */
export function StockRequestModal({ query, onClose }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [email, setEmail] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);

  // Auto-submit on mount
  useEffect(() => {
    setStatus("loading");
    fetch("/api/stock-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
      .then((r) => {
        if (r.ok) {
          setStatus("done");
          r.json().then((data) => setEmailSaved(Boolean(data.emailAttached))).catch(() => {});
        } else setStatus("error");
        captureEvent(r.ok ? "stock_request_succeeded" : "stock_request_failed", {
          query,
          status: r.status,
        });
      })
      .catch(() => {
        setStatus("error");
        captureEvent("stock_request_failed", { query, error: "network" });
      });
  }, [query]);

  async function saveEmail() {
    setEmailSaving(true);
    const response = await fetch("/api/stock-request", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, email }),
    }).catch(() => null);
    setEmailSaving(false);
    if (response?.ok) setEmailSaved(true);
  }

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        <motion.div
          className="oa-stock-request fixed inset-0 z-[70] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1, transition: { duration: 0.15 } }}
        >
          <motion.button
            aria-label="Close"
            type="button"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.15 } }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: POP }}
            exit={{ opacity: 0, scale: 0.96, y: 8, transition: POP_EXIT }}
            className="relative flex w-full max-w-[380px] flex-col items-center gap-5 rounded-3xl border border-[color-mix(in_srgb,var(--oa-fg,#17181a)_12%,transparent)] bg-[var(--oa-card,#ffffff)] p-7 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.08)]"
          >
            <div className="flex items-center justify-center">
              {status === "done" ? (
                <span className="inline-flex size-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--oa-fg,#17181a)_5%,transparent)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-6">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                </span>
              ) : status === "error" ? (
                <span className="inline-flex size-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--oa-fg,#17181a)_5%,transparent)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true" className="size-6">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                </span>
              ) : (
                <span className="inline-flex size-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--oa-fg,#17181a)_5%,transparent)]">
                  <span className="size-5 animate-spin rounded-full border-2 border-[color-mix(in_srgb,var(--oa-fg,#17181a)_20%,transparent)] border-t-[var(--oa-fg,#17181a)]" aria-hidden="true" />
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5 text-center">
              {status === "done" && (
                <>
                  <p className="text-[17px] font-medium tracking-tight text-[var(--oa-fg,#17181a)]">
                    Request sent for{" "}
                    <span className="font-medium">{query}</span>
                  </p>
                  <p className="text-sm leading-relaxed text-[color-mix(in_srgb,var(--oa-fg,#17181a)_55%,transparent)]">
                    We queued this request. Add an email if you want a note when the research is ready.
                  </p>
                </>
              )}
              {status === "error" && (
                <>
                  <p className="text-[17px] font-medium tracking-tight text-[var(--oa-fg,#17181a)]">Something went wrong</p>
                  <p className="text-sm leading-relaxed text-[color-mix(in_srgb,var(--oa-fg,#17181a)_55%,transparent)]">
                    Couldn&apos;t save your request. Please try again.
                  </p>
                </>
              )}
              {status === "loading" && (
                <p className="text-sm text-[color-mix(in_srgb,var(--oa-fg,#17181a)_55%,transparent)]">Sending request…</p>
              )}
            </div>

            {status === "done" && !emailSaved && (
              <form onSubmit={(event) => { event.preventDefault(); void saveEmail(); }} className="flex w-full gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email for stock request updates"
                  className="h-10 min-w-0 flex-1 rounded-full border border-[color-mix(in_srgb,var(--oa-fg,#17181a)_14%,transparent)] bg-transparent px-4 text-sm text-[var(--oa-fg,#17181a)] outline-none transition-colors placeholder:text-[color-mix(in_srgb,var(--oa-fg,#17181a)_40%,transparent)] focus:border-[color-mix(in_srgb,var(--oa-fg,#17181a)_30%,transparent)]"
                />
                <button
                  type="submit"
                  disabled={emailSaving}
                  className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[var(--oa-primary,#305dde)] px-4 text-sm font-medium text-white transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary,#305dde)_88%,black)] active:translate-y-px active:scale-[0.98] disabled:opacity-50"
                >
                  {emailSaving ? "Saving" : "Email me"}
                </button>
              </form>
            )}
            {status === "done" && emailSaved && (
              <p className="text-[13px] font-medium text-[#047857]">We&apos;ll email you when it&apos;s ready.</p>
            )}

            {status !== "loading" && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[var(--oa-primary,#305dde)] text-sm font-medium text-white transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary,#305dde)_88%,black)] active:translate-y-px active:scale-[0.98]"
              >
                {status === "done" ? "Got it" : "Close"}
              </button>
            )}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
