"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AnimatedIcon } from "@/components/animated-icon";
import { AgentClientLogos } from "@/components/agent-client-logos";
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
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-xl border border-outline-variant/70 bg-surface-container-low/60 p-4">
          <AnimatedIcon name="smart_toy" size={20} className="mt-0.5 shrink-0 text-landing-brand" />
          <div>
            <p className="text-[14px] font-semibold text-on-surface">Put Stocksbrew inside your agent</p>
            <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">
              Pro lets Claude, Cursor, and other MCP clients read your calls, targets, market brief, and Radar.
            </p>
          </div>
        </div>
        <AgentClientLogos compact />
        <ProCtaLink href="/subscribe" size="sm" showStar>Get Pro for agent access</ProCtaLink>
      </div>
    );
  }

  const activeTokens = tokens.filter((token) => !token.revoked_at);
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-outline-variant/70 bg-surface-container-low/60 p-4">
        <p className="text-[14px] font-semibold text-on-surface">Connect with OAuth</p>
        <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">
          In an MCP client that supports sign-in, add this server URL. Stocksbrew will ask you to approve access.
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-[11px] text-on-surface">{serverUrl}</code>
          <button type="button" onClick={() => copy(serverUrl, "url")} className="shrink-0 text-[11px] font-semibold text-landing-brand">
            {copied === "url" ? "Copied" : "Copy"}
          </button>
        </div>
        <AgentClientLogos compact className="mt-3" />
        <ol className="mt-4 grid gap-2 text-[11px] leading-relaxed text-on-surface-variant sm:grid-cols-3">
          <li><span className="font-semibold text-on-surface">1.</span> Add the server URL in your client.</li>
          <li><span className="font-semibold text-on-surface">2.</span> Sign in and approve read access.</li>
          <li><span className="font-semibold text-on-surface">3.</span> Ask about stocks, markets, or Radar.</li>
        </ol>
      </div>

      <div className="rounded-xl border border-outline-variant/70 bg-surface-container-low/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold text-on-surface">Personal access token</p>
            <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">
              Use a token when your developer tool asks for a Bearer header instead of OAuth.
            </p>
          </div>
          <span className="rounded-md border border-outline-variant px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
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
      </div>

      {newToken ? (
        <div className="rounded-xl border border-landing-brand/40 bg-landing-brand/5 p-4" role="status">
          <p className="text-[13px] font-bold text-on-surface">Copy this token now</p>
          <p className="mt-1 text-[11px] text-on-surface-variant">It will not be shown again.</p>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-3 py-2">
            <code className="min-w-0 flex-1 break-all text-[10px] text-on-surface">{newToken}</code>
            <button type="button" onClick={() => copy(newToken, "token")} className="shrink-0 text-[11px] font-semibold text-landing-brand">
              {copied === "token" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-outline-variant bg-surface p-3 text-[10px] leading-relaxed text-on-surface">{config}</pre>
          <button type="button" onClick={() => copy(config, "config")} className="mt-2 text-[11px] font-semibold text-landing-brand">
            {copied === "config" ? "Configuration copied" : "Copy configuration"}
          </button>
        </div>
      ) : null}

      {tokens.length ? (
        <div className="divide-y divide-outline-variant/50 rounded-xl border border-outline-variant/70">
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
      ) : null}

      {error ? <p className="text-[12px] text-red-600 dark:text-red-400" role="alert">{error}</p> : null}
      <p className="text-[11px] leading-relaxed text-on-surface-variant">
        Personal use only. No bulk extraction, resale, or redistribution. <Link href="/agents" className="font-semibold text-landing-brand">See agent examples</Link> or <Link href="/developers" className="font-semibold text-landing-brand">read the developer guide</Link>.
      </p>
    </div>
  );
}
