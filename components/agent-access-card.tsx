"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AgentSetupPrompt } from "@/components/agent-setup-prompt";
import { ProCtaLink } from "@/components/pro-cta";
import { trackAgentAccessAction } from "@/lib/product-analytics";

export type AgentTokenSummary = {
  id: string;
  label: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  calls_total: number;
};

type Props = {
  isSubscribed: boolean;
  serverUrl: string;
  initialTokens: AgentTokenSummary[];
  initialUsage: { used: number; remaining: number; limit: number };
};

function dateLabel(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : "Unknown";
}

export function AgentAccessCard({ isSubscribed, serverUrl, initialTokens, initialUsage }: Props) {
  const [tokens, setTokens] = useState(initialTokens);
  const [usage] = useState(initialUsage);
  const [label, setLabel] = useState("My agent");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = useMemo(() => JSON.stringify({
    mcpServers: {
      stocksbrew: {
        url: serverUrl,
        headers: { Authorization: `Bearer ${newToken || "YOUR_STOCKSBREW_TOKEN"}` },
      },
    },
  }, null, 2), [newToken, serverUrl]);

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      if (key === "url") trackAgentAccessAction({ action: "server_url_copied" });
      if (key === "config") trackAgentAccessAction({ action: "config_copied" });
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Could not copy automatically. Select and copy the value manually.");
    }
  }

  async function createToken() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/agent-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not create a token.");
      setNewToken(data.token);
      setTokens((current) => [data.token_record, ...current]);
      trackAgentAccessAction({ action: "token_created" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a token.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeToken(id: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/agent-tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not revoke the token.");
      setTokens((current) => current.map((token) => (
        token.id === id ? { ...token, revoked_at: new Date().toISOString() } : token
      )));
      trackAgentAccessAction({ action: "token_revoked" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke the token.");
    } finally {
      setBusy(false);
    }
  }

  if (!isSubscribed) {
    return (
      <div>
        <h3 className="text-[18px] font-extrabold tracking-tight text-on-surface">Give your AI current stock context.</h3>
        <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-on-surface-variant">
          Instead of a generic stock answer, it can retrieve Stocksbrew&apos;s current call, target, drivers, risks, and freshness.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <ProCtaLink href="/subscribe" size="sm" showStar>Get Pro</ProCtaLink>
          <Link href="/agents" className="text-[11px] font-bold text-landing-brand">How agent access works →</Link>
        </div>
      </div>
    );
  }

  const activeTokens = tokens.filter((token) => !token.revoked_at);
  return (
    <div>
      <section>
        <p className="text-[14px] font-semibold text-on-surface">Connect Stocksbrew</p>
        <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">
          Copy the setup prompt into your agent and approve only the research, Radar, and alert permissions it needs.
        </p>
        <AgentSetupPrompt compact className="mt-4" />
      </section>

      <section className="mt-7 border-t border-outline-variant pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold text-on-surface">Manual OAuth setup</p>
            <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">Add the remote server URL directly if your client has an MCP settings screen.</p>
          </div>
          <button type="button" onClick={() => copy(serverUrl, "url")} className="text-[11px] font-semibold text-landing-brand">
            {copied === "url" ? "URL copied ✓" : "Copy server URL"}
          </button>
        </div>
        <code className="mt-3 block break-all border-y border-outline-variant bg-surface-container-low/45 px-3 py-3 text-[11px] text-on-surface">{serverUrl}</code>
      </section>

      <section className="mt-7 border-t border-outline-variant pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold text-on-surface">Personal access token</p>
            <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">
              Use a token when your developer tool asks for a Bearer header instead of OAuth.
            </p>
          </div>
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
            {usage.used}/{usage.limit} calls
          </span>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={80}
            aria-label="Token name"
            className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-[12px] text-on-surface outline-none focus:border-landing-brand"
          />
          <button
            type="button"
            disabled={busy || activeTokens.length >= 5}
            onClick={createToken}
            className="rounded-full bg-landing-brand px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
          >
            {busy ? "Working…" : "Create token"}
          </button>
        </div>
        {activeTokens.length >= 5 ? (
          <p className="mt-2 text-[11px] text-on-surface-variant">Revoke a token before creating another.</p>
        ) : null}
      </section>

      {newToken ? (
        <section className="mt-6 border-l-2 border-landing-brand bg-landing-brand/5 px-4 py-3" role="status">
          <p className="text-[13px] font-bold text-on-surface">Copy this token now</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">It will not be shown again.</p>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-3 py-2">
            <code className="min-w-0 flex-1 break-all text-[10px] text-on-surface">{newToken}</code>
            <button type="button" onClick={() => copy(newToken, "token")} className="shrink-0 text-[11px] font-semibold text-landing-brand">
              {copied === "token" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="mt-3 overflow-x-auto border-y border-outline-variant bg-surface p-3 text-[10px] leading-relaxed text-on-surface">{config}</pre>
          <button type="button" onClick={() => copy(config, "config")} className="mt-2 text-[11px] font-semibold text-landing-brand">
            {copied === "config" ? "Configuration copied" : "Copy configuration"}
          </button>
        </section>
      ) : null}

      {tokens.length ? (
        <section className="mt-7 border-t border-outline-variant pt-5">
          <p className="mb-2 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">Issued tokens</p>
          <div className="divide-y divide-outline-variant border-y border-outline-variant">
          {tokens.map((token) => (
            <div key={token.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[12px] font-semibold text-on-surface">{token.label}</p>
                  {token.revoked_at ? <span className="font-mono text-[9px] uppercase text-on-surface-variant">Revoked</span> : null}
                </div>
                <p className="mt-0.5 font-mono text-[10px] text-on-surface-variant">
                  {token.prefix} · last used {dateLabel(token.last_used_at)}
                </p>
              </div>
              {!token.revoked_at ? (
                <button type="button" disabled={busy} onClick={() => revokeToken(token.id)} className="text-[11px] font-semibold text-red-600 disabled:opacity-50 dark:text-red-400">
                  Revoke
                </button>
              ) : null}
            </div>
          ))}
          </div>
        </section>
      ) : null}

      {error ? <p className="text-[12px] text-red-600 dark:text-red-400" role="alert">{error}</p> : null}
      <p className="mt-6 border-t border-outline-variant pt-4 text-[11px] leading-relaxed text-on-surface-variant">
        Personal use only. No bulk extraction, resale, or redistribution. <Link href="/agents" className="font-semibold text-landing-brand">See agent access</Link> or <Link href="/developers" className="font-semibold text-landing-brand">read the API docs</Link>.
      </p>
    </div>
  );
}
