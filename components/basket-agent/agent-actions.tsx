"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { Menu } from "@/components/screener/menu";

const ITEM =
  "flex w-full items-center px-3 py-2 text-left text-[14px] text-oa-fg hover:bg-oa-accent disabled:opacity-60";

/**
 * The agent page's one primary button (edit the basket) and a menu for the rest: pause or switch on, remove. Removing
 * archives the basket (its record stays in the store) and goes back to the agents list.
 */
export function BasketAgentActions({
  id,
  enabled,
  lines = null,
}: {
  id: string;
  enabled: boolean;
  /** "Add lines" (a thesis with measurable lines on the basket's companies, lib/thesis-monitor), or open the thesis it has. */
  lines?: { href: string; label: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{
    message: string;
    plan: boolean;
  } | null>(null);

  const call = async (init: RequestInit, after: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/basket-agents/${encodeURIComponent(id)}`,
        { ...init, headers: { "content-type": "application/json" } },
      );
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        feature?: string;
      } | null;
      if (!response.ok || !body?.ok) {
        // The plan's agent limit keeps its own words, with the way to more room.
        setError({
          message:
            body?.error || "That didn't go through. Try again in a minute.",
          plan: body?.feature === "agents",
        });
        return;
      }
      after();
    } catch {
      setError({
        message: "That didn't go through. Check your connection and try again.",
        plan: false,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <OaButton
          size="sm"
          onClick={() =>
            router.push(`/agents/baskets/${encodeURIComponent(id)}/edit`)
          }
        >
          Edit basket
        </OaButton>
        <Menu label="More" align="right" width="w-48">
          {(close) => (
            <div className="py-1">
              <button
                type="button"
                className={ITEM}
                disabled={busy}
                onClick={() => {
                  close();
                  void call(
                    {
                      method: "PATCH",
                      body: JSON.stringify({ enabled: !enabled }),
                    },
                    () => router.refresh(),
                  );
                }}
              >
                {enabled ? "Pause it" : "Switch it on"}
              </button>
              {lines ? (
                <Link
                  prefetch={false}
                  href={lines.href}
                  className={ITEM}
                  onClick={() => close()}
                >
                  {lines.label}
                </Link>
              ) : null}
              <button
                type="button"
                className={`${ITEM} text-signal-bearish`}
                disabled={busy}
                onClick={() => {
                  close();
                  if (
                    !window.confirm(
                      "Remove this basket? Its agent stops checking it.",
                    )
                  )
                    return;
                  void call({ method: "DELETE" }, () => router.push("/agents"));
                }}
              >
                Remove
              </button>
            </div>
          )}
        </Menu>
      </div>
      {error ? (
        <p
          role="alert"
          className="max-w-[18rem] text-right text-[12.5px] text-signal-bearish"
        >
          {error.message}
          {error.plan ? (
            <>
              {" "}
              <Link
                prefetch={false}
                href="/pricing#agents"
                className="font-medium text-oa-primary underline underline-offset-2"
              >
                See Pro
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
