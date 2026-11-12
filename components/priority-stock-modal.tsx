"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { KindIcon } from "@/components/oa/nav-icon";

type Props = {
  open: boolean;
  instrumentId: string;
  ticker: string;
};

/**
 * A quiet note beside the stock's price time when its price is not in the set refreshed through the trading day
 * (components/stock-page-stream.tsx `PriorityNotice` decides). Those prices update with the daily run after the close
 * (backend/vps/install-systemd.sh: the price lanes run hourly in the session for the core set; `postclose` at 16:10
 * ET does the rest). One line in plain words, never a modal over the page. Shown once per stock per browser session,
 * as before: the first showing marks it seen, and the × hides it now.
 */
export function PriorityPriceNote({ open, instrumentId, ticker }: Props) {
  const [visible, setVisible] = useState(false);
  const storageKey = useMemo(() => `tikrr_priority_stock_seen:${instrumentId}`, [instrumentId]);
  // The stock this note was shown for on this mount: React's strict mode runs the effect twice in development, and the
  // second run must not read the first run's "seen" mark and hide the note it just showed.
  const shownFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    if (shownFor.current === storageKey) {
      setVisible(true);
      return;
    }
    try {
      if (sessionStorage.getItem(storageKey) === "1") {
        setVisible(false);
        return;
      }
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // Session storage may be unavailable; show the note this visit.
    }
    shownFor.current = storageKey;
    setVisible(true);
  }, [open, storageKey]);

  if (!visible) return null;

  return (
    <p
      role="note"
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-oa-border bg-oa-bg py-0.5 pl-2 pr-0.5 text-[12px] leading-4 text-oa-muted-fg"
    >
      <KindIcon name="clock" className="size-3.5 text-oa-muted-fg" />
      <span className="min-w-0 text-pretty">{ticker}&apos;s price here updates after each close, not during the day.</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Hide this note"
        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-oa-muted-fg outline-none hover:bg-oa-accent hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
      >
        <KindIcon name="close" className="size-3.5" />
      </button>
    </p>
  );
}
