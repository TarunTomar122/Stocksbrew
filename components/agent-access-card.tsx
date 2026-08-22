"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AgentSetupPrompt } from "@/components/agent-setup-prompt";
import { trackAgentAccessAction } from "@/lib/product-analytics";
import { OaButton } from "@/components/oa/button";
import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import {
  trackCheckoutClicked,
  trackCheckoutStarted,
} from "@/lib/product-analytics";
import { startDodoCheckout } from "@/lib/dodo-checkout-client";

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

/** Checkout button in the OA system. */
function GetProButton() {
  const { user } = useUser();
  const [busy, setBusy] = useState(false);

  async function openCheckout() {
    if (busy) return;
    setBusy(true);
    trackCheckoutClicked({ period: "monthly", market: "US", signedIn: Boolean(user) });
    try {
      if (!user) await signInWithGoogle({ surface: "paywall" });
      const checkoutUrl = await startDodoCheckout();
      trackCheckoutStarted({ period: "monthly", market: "US" });
      window.location.assign(checkoutUrl);
    } catch (err) {
      console.error("direct checkout failed", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <OaButton onClick={() => void openCheckout()} loading={busy} size="sm">
      Get Pro
    </OaButton>
  );
}

const LINK =
  "font-medium text-oa-fg underline decoration-oa-border underline-offset-4 outline-none transition-colors hover:decoration-oa-fg focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]";

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
        <h3 className="text-balance font-medium tracking-tight text-oa-fg text-lg leading-snug">
          Give your AI current stock context.
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-oa-muted-fg">
          Instead of a generic stock answer, it can retrieve Stocksbrew&apos;s current call,
          target, drivers, risks, and freshness.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <GetProButton />
          <Link href="/agents" className={LINK}>
            How agent access works
          </Link>
        </div>
      </div>
    );
  }

  const activeTokens = tokens.filter((token) => !token.revoked_at);
  return (
    <div>
      <section>
        <p className="text-[15px] font-medium text-oa-fg">Connect Stocksbrew</p>
        <p className="mt-1 text-sm leading-6 text-oa-muted-fg">
          Copy the setup prompt into your agent and approve only the research, Watchlist and alert
          permissions it needs.
        </p>
        <AgentSetupPrompt compact className="mt-4" />
      </section>

      <section className="mt-6 border-t border-oa-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-medium text-oa-fg">Manual OAuth setup</p>
            <p className="mt-1 text-sm leading-6 text-oa-muted-fg">
              Add the remote server URL directly if your client has an MCP settings screen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => copy(serverUrl, "url")}
            className="cursor-pointer rounded-lg px-1 text-sm font-medium text-oa-muted-fg outline-none transition-colors hover:text-oa-fg focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
          >
            {copied === "url" ? "URL copied" : "Copy server URL"}
          </button>
        </div>
        <code className="oa-mono mt-3 block break-all rounded-lg border border-oa-border bg-oa-bg px-3 py-2.5 text-xs text-oa-fg/80">
          {serverUrl}
        </code>
      </section>

      <section className="mt-6 border-t border-oa-border pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-medium text-oa-fg">Personal access token</p>
            <p className="mt-1 text-sm leading-6 text-oa-muted-fg">
              Use a token when your developer tool asks for a Bearer header instead of OAuth.
            </p>
          </div>
          <span className="oa-mono shrink-0 text-xs tabular-nums text-oa-muted-fg">
            {usage.used}/{usage.limit} calls today
          </span>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={80}
            aria-label="Token name"
            className="min-w-0 flex-1 rounded-lg border border-oa-border bg-oa-bg px-3 py-2 text-sm text-oa-fg outline-none transition-colors placeholder:text-oa-muted-fg/70 focus-visible:border-transparent focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
          />
          <OaButton variant="secondary" size="sm" loading={busy} disabled={activeTokens.length >= 5} onClick={createToken}>
            Create token
          </OaButton>
        </div>
        {activeTokens.length >= 5 ? (
          <p className="mt-2 text-sm leading-6 text-oa-muted-fg">
            Revoke a token before creating another.
          </p>
        ) : null}
      </section>

      {newToken ? (
        <section className="mt-5 rounded-[18px] border border-oa-border bg-oa-bg p-4" role="status">
          <p className="font-medium text-emerald-700 dark:text-emerald-400">Copy this token now</p>
          <p className="mt-0.5 text-sm leading-6 text-oa-muted-fg">It will not be shown again.</p>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-oa-border bg-oa-card px-3 py-2">
            <code className="oa-mono min-w-0 flex-1 break-all text-xs text-oa-fg">{newToken}</code>
            <button
              type="button"
              onClick={() => copy(newToken, "token")}
              className="shrink-0 cursor-pointer rounded-lg px-1 text-sm font-medium text-oa-muted-fg outline-none transition-colors hover:text-oa-fg focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
            >
              {copied === "token" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="oa-mono mt-3 overflow-x-auto rounded-lg border border-oa-border bg-oa-card p-3 text-xs leading-relaxed text-oa-fg/80">
            {config}
          </pre>
          <button
            type="button"
            onClick={() => copy(config, "config")}
            className="mt-2 cursor-pointer rounded-lg px-1 text-sm font-medium text-oa-muted-fg outline-none transition-colors hover:text-oa-fg focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
          >
            {copied === "config" ? "Configuration copied" : "Copy configuration"}
          </button>
        </section>
      ) : null}

      {tokens.length ? (
        <section className="mt-6 border-t border-oa-border pt-5">
          <p className="mb-2 text-sm font-medium text-oa-fg/80">Issued tokens</p>
          <div className="divide-y divide-oa-border">
            {tokens.map((token) => (
              <div key={token.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-oa-fg">{token.label}</p>
                    {token.revoked_at ? (
                      <span className="rounded-full border border-oa-border px-2 py-0.5 text-xs text-oa-muted-fg">
                        Revoked
                      </span>
                    ) : null}
                  </div>
                  <p className="oa-mono mt-0.5 text-xs text-oa-muted-fg">
                    {token.prefix} · last used {dateLabel(token.last_used_at)}
                  </p>
                </div>
                {!token.revoked_at ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => revokeToken(token.id)}
                    className="cursor-pointer rounded-lg px-1 text-sm font-medium text-red-600 outline-none transition-colors hover:text-red-700 focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Revoke
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="mt-4 text-xs leading-5 text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <p className="mt-6 border-t border-oa-border pt-4 text-sm leading-6 text-oa-muted-fg">
        Personal use only. No bulk extraction, resale, or redistribution.{" "}
        <Link href="/agents" className={LINK}>See agent access</Link> or{" "}
        <Link href="/developers" className={LINK}>read the API docs</Link>.
      </p>
    </div>
  );
}
