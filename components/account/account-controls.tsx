"use client";

import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import * as React from "react";

import { CopyButton } from "@/components/docs/copy-button";
import { OaButton } from "@/components/oa/button";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { signInWithGoogle } from "@/lib/sign-in";

/**
 * The interactive parts of the Account page. Each one talks to a route that
 * already existed; none of them changes a request or response shape.
 */

const NUM = "oa-mono tabular-nums";
const INPUT =
  "oa-surface h-9 min-w-0 border border-oa-border bg-oa-bg px-2.5 text-[14.5px] text-oa-fg outline-none placeholder:text-oa-muted-fg focus-visible:border-[color-mix(in_srgb,var(--oa-ring)_70%,transparent)]";

function day(iso: string | null): string {
  if (!iso) return "never";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/* ── Email switches ────────────────────────────────────────────────────── */

export function EmailSwitch({
  field,
  label,
  description,
  initial,
  disabled = false,
}: {
  field: "email_alerts_enabled" | "email_digest_enabled" | "email_weekly_enabled" | "email_product_enabled";
  label: string;
  description: string;
  initial: boolean;
  disabled?: boolean;
}) {
  const [on, setOn] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function toggle() {
    const next = !on;
    setOn(next);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      });
      if (!response.ok) throw new Error();
    } catch {
      setOn(!next);
      setError("That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 border-b border-oa-border px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[15px] font-medium leading-6 text-oa-fg">{label}</p>
        <p className="text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{description}</p>
        {error ? (
          <p role="alert" className="mt-1 text-[13px] text-signal-bearish">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled || busy}
        onClick={() => void toggle()}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--oa-card)] disabled:cursor-default disabled:opacity-60 ${
          on ? "bg-oa-primary" : "bg-[color-mix(in_srgb,var(--oa-fg)_22%,transparent)]"
        }`}
      >
        <span aria-hidden="true" className={`inline-block size-5 rounded-full bg-oa-card shadow-sm transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

/* ── Personal tokens ───────────────────────────────────────────────────── */

export type TokenRow = {
  id: string;
  label: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  calls_total: number;
};

export function TokenManager({ initial, maxActive, mcpUrl, disabled = false }: { initial: TokenRow[]; maxActive: number; mcpUrl: string; disabled?: boolean }) {
  const [tokens, setTokens] = React.useState(initial);
  const [label, setLabel] = React.useState("");
  const [fresh, setFresh] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showRevoked, setShowRevoked] = React.useState(false);

  const active = tokens.filter((token) => !token.revoked_at);
  const revoked = tokens.filter((token) => token.revoked_at);
  const atLimit = active.length >= maxActive;

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError(null);
    try {
      const response = await fetch("/api/agent-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || "My agent" }),
      });
      const data = (await response.json().catch(() => ({}))) as { token?: string; token_record?: TokenRow; message?: string; error?: string };
      if (!response.ok || !data.token || !data.token_record) throw new Error(data.message || (data.error === "pro_required" ? "Tokens need an active Pro plan." : "Could not create a token."));
      setFresh(data.token);
      setTokens((current) => [data.token_record as TokenRow, ...current]);
      setLabel("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a token.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/agent-tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not revoke that token.");
      setTokens((current) => current.map((token) => (token.id === id ? { ...token, revoked_at: new Date().toISOString() } : token)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke that token.");
    } finally {
      setBusy(null);
    }
  }

  const config = JSON.stringify({ mcpServers: { stocksbrew: { url: mcpUrl, headers: { Authorization: `Bearer ${fresh ?? "YOUR_STOCKSBREW_TOKEN"}` } } } }, null, 2);

  return (
    <div>
      {fresh ? (
        <div role="status" className="border-b border-oa-border bg-[color-mix(in_srgb,var(--oa-primary)_8%,transparent)] px-4 py-3">
          <p className="text-[15px] font-medium leading-6 text-oa-fg">Copy this token now. It will not be shown again.</p>
          <p className="text-[13.5px] leading-5 text-oa-muted-fg">We keep only a hash of it. If you lose it, revoke it and create another.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="oa-mono oa-surface min-w-0 flex-1 break-all border border-oa-border bg-oa-card px-2.5 py-1.5 text-[12.5px] leading-5 text-oa-fg">{fresh}</code>
            <CopyButton value={fresh} />
          </div>
          <details className="mt-2">
            <summary className="oa-mono cursor-pointer text-[12px] uppercase tracking-[0.06em] text-oa-label">Config for an MCP client</summary>
            <div className="mt-2 flex items-start gap-2">
              <pre className="oa-mono oa-surface min-w-0 flex-1 overflow-x-auto border border-oa-border bg-oa-card p-2.5 text-[12px] leading-5 text-oa-fg">{config}</pre>
              <CopyButton value={config} />
            </div>
          </details>
        </div>
      ) : null}

      {active.length === 0 ? (
        <p className="border-b border-oa-border px-4 py-4 text-[14.5px] leading-6 text-oa-muted-fg">
          No active tokens. Create one when a script or a client asks for a bearer token. Agents that connect with OAuth do not need one.
        </p>
      ) : (
        <ul>
          {active.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-oa-border px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium leading-6 text-oa-fg">{token.label}</p>
                <p className={`${NUM} text-[12px] leading-4 text-oa-muted-fg`}>
                  {token.prefix} · created {day(token.created_at)} · last used {day(token.last_used_at)} · {token.calls_total.toLocaleString("en-US")} calls
                </p>
              </div>
              <OaButton variant="ghost" size="xs" loading={busy === token.id} disabled={disabled || busy != null} onClick={() => void revoke(token.id)} className="!text-signal-bearish">
                Revoke
              </OaButton>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(event) => void create(event)} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="token-name">
          Token name
        </label>
        <input
          id="token-name"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={80}
          placeholder="Name, for example Laptop script"
          disabled={disabled || atLimit}
          className={`${INPUT} flex-1`}
        />
        <OaButton type="submit" variant="secondary" size="sm" loading={busy === "create"} disabled={disabled || atLimit || busy != null}>
          Create token
        </OaButton>
        <span className={`${NUM} text-[12px] text-oa-muted-fg`}>
          {active.length} of {maxActive} active
        </span>
      </form>
      {atLimit ? <p className="px-4 pb-3 text-[13.5px] leading-5 text-oa-muted-fg">You have {maxActive} active tokens, which is the limit. Revoke one to create another.</p> : null}
      {error ? (
        <p role="alert" className="px-4 pb-3 text-[13.5px] leading-5 text-signal-bearish">
          {error}
        </p>
      ) : null}

      {revoked.length > 0 ? (
        <div className="border-t border-oa-border px-4 py-2">
          <button
            type="button"
            onClick={() => setShowRevoked((value) => !value)}
            aria-expanded={showRevoked}
            className="oa-mono cursor-pointer rounded text-[12px] uppercase tracking-[0.06em] text-oa-muted-fg outline-none hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]"
          >
            {showRevoked ? "Hide" : "Show"} {revoked.length} revoked
          </button>
          {showRevoked ? (
            <ul className="mt-1">
              {revoked.map((token) => (
                <li key={token.id} className={`${NUM} py-1 text-[12px] leading-4 text-oa-muted-fg`}>
                  <span className="font-sans text-[13.5px]">{token.label}</span> · {token.prefix} · revoked {day(token.revoked_at)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ── Sign out, delete ──────────────────────────────────────────────────── */

export function SignOutButton({ disabled = false }: { disabled?: boolean }) {
  const [busy, setBusy] = React.useState(false);
  async function run() {
    setBusy(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      await signOut(getFirebaseAuth());
      window.location.assign("/");
    } catch {
      setBusy(false);
    }
  }
  return (
    <OaButton variant="secondary" size="sm" loading={busy} disabled={disabled} onClick={() => void run()}>
      Sign out
    </OaButton>
  );
}

export function DeleteAccount({ billable, disabled = false }: { billable: boolean; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ready = typed.trim().toLowerCase() === "delete";

  async function run() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("Your sign-in has expired. Reload the page and sign in again.");
      const response = await fetch("/api/user/account", { method: "DELETE", headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not delete the account.");
      await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
      await signOut(auth).catch(() => undefined);
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <OaButton variant="ghost" size="sm" disabled={disabled} onClick={() => setOpen(true)} className="!text-signal-bearish">
        Delete account
      </OaButton>
    );
  }

  return (
    <div className="w-full sm:max-w-sm">
      <p className="text-[13.5px] leading-5 text-oa-fg">
        This cannot be undone.{billable ? " Your subscription will be set to cancel at the end of the period." : ""} Type <span className="oa-mono">delete</span> to confirm.
      </p>
      <div className="mt-2 flex gap-2">
        <label className="sr-only" htmlFor="delete-confirm">
          Type delete to confirm
        </label>
        <input id="delete-confirm" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" autoFocus className={`${INPUT} flex-1`} />
        <OaButton size="sm" loading={busy} disabled={!ready} onClick={() => void run()} className="!border-transparent !bg-signal-bearish !text-white">
          Delete
        </OaButton>
        <OaButton
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
        >
          Keep
        </OaButton>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[13.5px] leading-5 text-signal-bearish">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ── Feedback ──────────────────────────────────────────────────────────── */

export function FeedbackForm({ disabled = false }: { disabled?: boolean }) {
  const [text, setText] = React.useState("");
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const feedback = text.trim();
    if (!feedback) return;
    setState("sending");
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback }) });
      if (!response.ok) throw new Error();
      setText("");
      setState("sent");
    } catch {
      setState("failed");
    }
  }

  return (
    <form onSubmit={(event) => void send(event)} className="p-4">
      <label htmlFor="feedback" className="text-[15px] font-medium leading-6 text-oa-fg">
        What is wrong, missing or confusing?
      </label>
      <p className="text-[13.5px] leading-5 text-oa-muted-fg">It goes to the person who builds this, with your email so he can reply.</p>
      <textarea
        id="feedback"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (state !== "idle") setState("idle");
        }}
        rows={3}
        maxLength={2000}
        disabled={disabled}
        className="oa-surface mt-2 block w-full resize-y border border-oa-border bg-oa-bg px-3 py-2 text-[15px] leading-6 text-oa-fg outline-none focus-visible:border-[color-mix(in_srgb,var(--oa-ring)_70%,transparent)]"
      />
      <div className="mt-2 flex items-center gap-3">
        <OaButton type="submit" variant="secondary" size="sm" loading={state === "sending"} disabled={disabled || text.trim().length === 0}>
          Send
        </OaButton>
        <span role="status" className="text-[13.5px] leading-5 text-oa-muted-fg">
          {state === "sent" ? "Sent. Thank you." : state === "failed" ? "That did not send. Try again, or email instead." : `${text.length}/2000`}
        </span>
      </div>
    </form>
  );
}

/* ── Signed out ────────────────────────────────────────────────────────── */

export function SignInPanel() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle({ surface: "unknown" });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error && /popup/i.test(cause.message) ? "The sign-in window was closed or blocked. Allow pop-ups for this site and try again." : "Sign-in did not complete. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <OaButton loading={busy} onClick={() => void run()}>
        Sign in with Google
      </OaButton>
      {error ? (
        <p role="alert" className="text-[13.5px] leading-5 text-signal-bearish">
          {error}
        </p>
      ) : null}
    </div>
  );
}
