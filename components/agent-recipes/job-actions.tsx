"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { Menu } from "@/components/screener/menu";

const ITEM = "flex w-full items-center px-3 py-2 text-left text-[14px] text-oa-fg hover:bg-oa-accent disabled:opacity-60";

/**
 * An agent page's one primary button (switch it on, or pause it) and a menu for the rest: check now and remove.
 * Removing archives the agent and keeps its history (lib/agent-jobs-data.ts updateJob).
 */
export function JobActions({ id, enabled }: { id: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<{ message: string; plan: boolean } | null>(null);

  const call = async (key: string, url: string, init: RequestInit, after: () => void) => {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
      const body = (await response.json().catch(() => null)) as { error?: string; feature?: string } | null;
      if (!response.ok) {
        setError({ message: body?.error || "That didn't go through. Try again in a minute.", plan: body?.feature === "agents" || body?.feature === "agent_events" });
        return;
      }
      after();
    } catch {
      setError({ message: "That didn't go through. Check your connection and try again.", plan: false });
    } finally {
      setBusy(null);
    }
  };
  const path = `/api/agent-jobs/${encodeURIComponent(id)}`;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <OaButton
          size="sm"
          variant={enabled ? "secondary" : "primary"}
          loading={busy === "toggle"}
          onClick={() => void call("toggle", path, { method: "PATCH", body: JSON.stringify({ enabled: !enabled }) }, () => router.refresh())}
        >
          {enabled ? "Pause it" : "Switch it on"}
        </OaButton>
        <Menu label="More" align="right" width="w-48">
          {(close) => (
            <div className="py-1">
              <button
                type="button"
                className={ITEM}
                disabled={!enabled || busy !== null}
                title={enabled ? undefined : "Paused. Switch it on to check now."}
                onClick={() => {
                  close();
                  void call("run", `${path}/run`, { method: "POST" }, () => router.refresh());
                }}
              >
                Check now
              </button>
              <button
                type="button"
                className={`${ITEM} text-signal-bearish`}
                disabled={busy !== null}
                onClick={() => {
                  close();
                  if (!window.confirm("Remove this agent? It stops checking. Its history stays.")) return;
                  void call("remove", path, { method: "DELETE" }, () => router.push("/agents"));
                }}
              >
                Remove
              </button>
            </div>
          )}
        </Menu>
      </div>
      {error ? (
        <p role="alert" className="max-w-[18rem] text-right text-[12.5px] text-signal-bearish">
          {error.message}
          {error.plan ? (
            <>
              {" "}
              <Link prefetch={false} href="/pricing#agents" className="font-medium text-oa-primary underline underline-offset-2">
                See Pro
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
