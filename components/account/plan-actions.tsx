"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { useProCheckout } from "@/lib/use-pro-checkout";

/**
 * The buttons in "Plan and billing": upgrade, cancel, and re-check a payment
 * that has not shown up yet. They call the existing subscription routes and
 * change nothing about their request shapes.
 */

const REASONS = [
  { id: "too_expensive", label: "Too expensive" },
  { id: "not_using_enough", label: "Not using it enough" },
  { id: "missing_stocks", label: "Missing stocks I need" },
  { id: "calls_not_helpful", label: "Calls are not helpful yet" },
  { id: "technical_issue", label: "Something broke" },
  { id: "other", label: "Other" },
] as const;

type ReasonId = (typeof REASONS)[number]["id"];

/** A code for one free month, offered once before a cancellation goes through. The cancel route records that it was shown. */
const RETENTION_CODE = "XWDPFXVBZHV0UHEY";

async function idToken(): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Your sign-in has expired. Reload the page and sign in again.");
  return user.getIdToken();
}

export function UpgradeButton({ disabled = false, label = "Get Pro" }: { disabled?: boolean; label?: string }) {
  const { openCheckout, busy } = useProCheckout("paywall");
  return (
    <OaButton size="sm" loading={busy} disabled={disabled} onClick={() => void openCheckout()}>
      {label}
    </OaButton>
  );
}

/** Asks the payment provider whether a subscription is active, for the minutes after checkout when the webhook has not landed. */
export function RefreshPlanButton({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/subscription/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await idToken()}` },
        body: JSON.stringify({}),
      });
      const data = (await response.json().catch(() => ({}))) as { subscribed?: boolean };
      if (data.subscribed) {
        router.refresh();
        setMessage("Pro is active.");
      } else {
        setMessage("No active subscription found for this account. If you paid in the last few minutes, try again shortly.");
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not check just now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <OaButton variant="secondary" size="sm" loading={busy} disabled={disabled} onClick={() => void refresh()}>
        I already paid
      </OaButton>
      {message ? (
        <span role="status" className="text-[13px] leading-5 text-oa-muted-fg">
          {message}
        </span>
      ) : null}
    </span>
  );
}

export function CancelPlan({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<"why" | "confirm">("why");
  const [reason, setReason] = React.useState<ReasonId | null>(null);
  const [feedback, setFeedback] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const dialog = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    dialog.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy]);

  function start() {
    setStep("why");
    setError(null);
    setCopied(false);
    setOpen(true);
  }

  async function cancel() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await idToken()}` },
        body: JSON.stringify({ reason, feedback, retentionCode: RETENTION_CODE }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not cancel the subscription.");
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <OaButton variant="secondary" size="sm" disabled={disabled} onClick={start}>
        Cancel subscription
      </OaButton>
      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-black/40 p-0 sm:items-center sm:p-6" onMouseDown={(event) => event.target === event.currentTarget && !busy && setOpen(false)}>
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
            tabIndex={-1}
            className="oa-surface w-full max-w-[32rem] border border-oa-border bg-oa-card p-5 outline-none sm:p-6"
          >
            <p className="oa-caption">{step === "why" ? "Step 1 of 2" : "Step 2 of 2"}</p>
            <h2 id="cancel-title" className="mt-1 text-[21px] font-medium leading-7 tracking-tight text-oa-fg">
              {step === "why" ? "What made Pro not worth it?" : "Cancel at the end of this period"}
            </h2>

            {step === "why" ? (
              <>
                <p className="mt-1 text-[14.5px] leading-6 text-oa-muted-fg">One tap. It is the most useful thing you can tell us.</p>
                <div role="radiogroup" aria-label="Reason" className="mt-4 grid gap-1.5 sm:grid-cols-2">
                  {REASONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={reason === item.id}
                      onClick={() => setReason(item.id)}
                      className={`h-10 cursor-pointer rounded-md border px-3 text-left text-[14.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] ${
                        reason === item.id ? "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-card font-medium text-oa-fg" : "border-oa-border bg-oa-card text-oa-fg hover:bg-oa-accent"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <label className="mt-4 block">
                  <span className="oa-caption">Anything we should fix? Optional</span>
                  <textarea
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    rows={3}
                    maxLength={1000}
                    className="oa-surface mt-1 block w-full resize-none border border-oa-border bg-oa-bg px-3 py-2 text-[15px] leading-6 text-oa-fg outline-none focus-visible:border-[color-mix(in_srgb,var(--oa-ring)_70%,transparent)]"
                  />
                </label>
              </>
            ) : (
              <>
                <ul className="mt-3 flex flex-col gap-1.5 text-[15px] leading-6 text-oa-fg/90">
                  <li>You will not be charged again.</li>
                  <li>You keep Pro until the period you already paid for ends.</li>
                  <li>Your portfolio, alerts and agents stay. Limits apply again once Pro ends.</li>
                </ul>
                <div className="oa-surface mt-4 border border-oa-border bg-oa-bg px-3 py-2.5">
                  <p className="text-[14px] leading-5 text-oa-fg">Would a free month change your mind? This code takes one month off at checkout.</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="oa-mono min-w-0 flex-1 truncate rounded border border-oa-border bg-oa-card px-2 py-1.5 text-[13px] tracking-[0.08em] text-oa-fg">{RETENTION_CODE}</code>
                    <OaButton
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(RETENTION_CODE).then(
                          () => setCopied(true),
                          () => setCopied(false),
                        );
                      }}
                    >
                      {copied ? "Copied" : "Copy"}
                    </OaButton>
                  </div>
                </div>
              </>
            )}

            {error ? (
              <p role="alert" className="mt-3 text-[13.5px] leading-5 text-signal-bearish">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <OaButton variant="secondary" size="sm" disabled={busy} onClick={() => setOpen(false)}>
                Keep Pro
              </OaButton>
              {step === "why" ? (
                <OaButton size="sm" disabled={!reason} onClick={() => setStep("confirm")}>
                  Continue
                </OaButton>
              ) : (
                <OaButton size="sm" loading={busy} onClick={() => void cancel()}>
                  Cancel subscription
                </OaButton>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
