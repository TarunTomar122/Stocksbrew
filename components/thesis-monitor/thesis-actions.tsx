"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { Menu } from "@/components/screener/menu";

const ITEM = "flex w-full items-center px-3 py-2 text-left text-[14px] text-oa-fg hover:bg-oa-accent disabled:opacity-60";

/**
 * The thesis page's one primary button (edit the lines) and a menu for the rest: pause or switch on the basket it
 * lives on, open that basket (an idea basket's thesis), and remove. Removing a thesis over holdings archives it like
 * any basket; on an idea basket it only takes the lines off.
 */
export function ThesisActions({ id, enabled, holdings, editHref, basketHref }: { id: string; enabled: boolean; holdings: boolean; editHref: string; basketHref: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; plan: boolean } | null>(null);

  const call = async (url: string, init: RequestInit, after: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; feature?: string } | null;
      if (!response.ok || !body?.ok) {
        setError({ message: body?.error || "That didn't go through. Try again in a minute.", plan: body?.feature === "agents" });
        return;
      }
      after();
    } catch {
      setError({ message: "That didn't go through. Check your connection and try again.", plan: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <OaButton size="sm" onClick={() => router.push(editHref)}>
          Edit lines
        </OaButton>
        <Menu label="More" align="right" width="w-52">
          {(close) => (
            <div className="py-1">
              <button
                type="button"
                className={ITEM}
                disabled={busy}
                onClick={() => {
                  close();
                  void call(`/api/basket-agents/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ enabled: !enabled }) }, () => router.refresh());
                }}
              >
                {enabled ? "Pause it" : "Switch it on"}
              </button>
              {basketHref ? (
                <Link prefetch={false} href={basketHref} className={ITEM} onClick={() => close()}>
                  Open the basket
                </Link>
              ) : null}
              <button
                type="button"
                className={`${ITEM} text-signal-bearish`}
                disabled={busy}
                onClick={() => {
                  close();
                  if (!window.confirm(holdings ? "Remove this thesis? Its agent stops checking it." : "Take the lines off this basket? The basket stays.")) return;
                  void call(`/api/theses/${encodeURIComponent(id)}`, { method: "DELETE" }, () => router.push(holdings ? "/agents" : (basketHref ?? "/agents")));
                }}
              >
                {holdings ? "Remove" : "Remove the lines"}
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
