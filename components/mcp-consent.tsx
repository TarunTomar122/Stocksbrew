"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { signInWithGoogle } from "@/lib/sign-in";

type Props = {
  clientName: string;
  scopes: string[];
  authorizationParams: Record<string, string>;
  signedIn: boolean;
  subscribed: boolean;
};

const SCOPE_COPY: Record<string, string> = {
  "stocks:read": "Read stock calls, targets, fundamentals, risks, and comparisons",
  "market:read": "Read the current Stocksbrew market brief and sector context",
  "radar:read": "Read your private Watchlist stocks, holdings context and changes",
  "radar:write": "Add or remove stocks from your Watchlist after you approve the action",
  "alerts:read": "Read your active Stocksbrew alerts",
  "alerts:write": "Create or remove alerts after you approve the action",
};

export function McpConsent({ clientName, scopes, authorizationParams, signedIn, subscribed }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle({ surface: "agent_oauth" });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: "approve" | "deny") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/mcp/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...authorizationParams, decision }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error_description || "Authorization failed.");
      if (!data.redirect_to) throw new Error("The client did not provide a valid return URL.");
      window.location.assign(data.redirect_to);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authorization failed.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm sm:p-7">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-landing-brand">Stocksbrew for Agents</p>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-on-surface">Connect {clientName}</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">
        This client is asking to use your Stocksbrew Pro research workflow. Stocksbrew never gives it trading access.
      </p>

      <ul className="mt-5 space-y-2.5">
        {scopes.map((scope) => (
          <li key={scope} className="flex gap-2 rounded-xl border border-outline-variant/70 bg-surface-container-low/60 p-3 text-[12px] text-on-surface">
            <span aria-hidden className="text-landing-brand">✓</span>
            {SCOPE_COPY[scope] || scope}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[11px] leading-relaxed text-on-surface-variant">
        Only approve clients you trust. Watchlist and alert changes still require your instruction in the agent. You can revoke access from your profile.
      </p>

      {error ? <p className="mt-4 text-[12px] text-red-600 dark:text-red-400" role="alert">{error}</p> : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {!signedIn ? (
          <button type="button" disabled={busy} onClick={signIn} className="rounded-full bg-landing-brand px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50">
            {busy ? "Signing in…" : "Sign in to continue"}
          </button>
        ) : !subscribed ? (
          <a href="/subscribe" className="rounded-full bg-landing-brand px-5 py-2.5 text-[13px] font-bold text-white">Get Pro to connect</a>
        ) : (
          <button type="button" disabled={busy} onClick={() => decide("approve")} className="rounded-full bg-landing-brand px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50">
            {busy ? "Connecting…" : "Approve connection"}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => decide("deny")} className="rounded-full border border-outline-variant px-5 py-2.5 text-[13px] font-semibold text-on-surface disabled:opacity-50">
          Cancel
        </button>
      </div>
    </div>
  );
}
