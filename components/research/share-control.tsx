"use client";

import * as React from "react";

import { sharedHref } from "@/lib/research/types";

/**
 * The owner's control for a public link to one report. The shared page shows
 * the same report without anything personal; turning the link off makes it
 * stop working at once.
 */
export function ShareControl({ ticker, reportKey, shareId: initial }: { ticker: string; reportKey: string; shareId: string | null }) {
  const [shareId, setShareId] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const url = shareId ? `${typeof window === "undefined" ? "" : window.location.origin}${sharedHref(ticker, shareId)}` : null;

  // Clipboard access can be refused (an insecure origin, a browser setting): say where the link is instead.
  async function copy(link: string) {
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(link);
      setNote("Link copied.");
    } catch {
      setNote("The link is on. Use Open to get its address.");
    }
  }

  async function change(share: boolean) {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/research/report", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker, key: reportKey, share }),
      });
      const data = (await response.json().catch(() => ({}))) as { share_id?: string | null; message?: string };
      if (!response.ok) {
        setNote(data.message ?? "The link could not be changed. Try again.");
        return;
      }
      setShareId(data.share_id ?? null);
      if (share && data.share_id) {
        const link = `${window.location.origin}${sharedHref(ticker, data.share_id)}`;
        await copy(link);
      } else {
        setNote("The link is off.");
      }
    } catch {
      setNote("The link could not be changed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[13px] font-medium">
        {shareId && url ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void copy(url)}
              className="min-h-8 text-oa-primary hover:underline disabled:opacity-50"
            >
              Copy link
            </button>
            <a href={sharedHref(ticker, shareId)} target="_blank" rel="noopener noreferrer" className="min-h-8 leading-8 text-oa-muted-fg hover:text-oa-fg">
              Open
            </a>
            <button type="button" disabled={busy} onClick={() => change(false)} className="min-h-8 text-oa-muted-fg hover:text-oa-fg disabled:opacity-50">
              Turn off link
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => change(true)} className="min-h-8 text-oa-primary hover:underline disabled:opacity-50">
            {busy ? "Making a link..." : "Share a link"}
          </button>
        )}
      </div>
      {note ? (
        <p role="status" className="text-[12px] text-oa-muted-fg">
          {note}
        </p>
      ) : null}
    </div>
  );
}
