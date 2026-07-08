"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  ticker: string;
  market: "US" | "IN";
};

/** Share button on the stock page. Fetches a pixel-perfect PNG from the
 * server-rendered @vercel/og route (`/api/stock-target-card/[symbol]`) and
 * offers copy-image / copy-link. The PNG is prefetched on open/hover and the
 * blob is cached so the copy action is instant. */
export function StockShareCard({ ticker, market }: Props) {
  const [open, setOpen] = useState(false);
  const [imgState, setImgState] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const [linkCopied, setLinkCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<Blob | null>(null);
  const pendingRef = useRef<Promise<Blob> | null>(null);

  const pageUrl =
    typeof window !== "undefined"
      ? window.location.href
      : `https://www.stocksbrew.online/stock/${ticker}`;
  const cardUrl = `/api/stock-target-card/${encodeURIComponent(ticker)}?m=${market}`;

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  /** Fetch once, dedupe concurrent calls, and cache the blob for the session. */
  function fetchBlob(): Promise<Blob> {
    if (blobRef.current) return Promise.resolve(blobRef.current);
    if (pendingRef.current) return pendingRef.current;
    const p = fetch(cardUrl, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`card route ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        blobRef.current = blob;
        return blob;
      })
      .finally(() => {
        pendingRef.current = null;
      });
    pendingRef.current = p;
    return p;
  }

  /** Warm the image ahead of the click (menu open / button hover). */
  function prefetch() {
    fetchBlob().catch(() => {});
  }

  async function handleCopyImage() {
    setImgState("loading");
    try {
      const blob = await fetchBlob();
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setImgState("copied");
        setTimeout(() => setImgState("idle"), 2500);
        return;
      }
      // Clipboard image API unavailable — download as a graceful fallback.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stocksbrew-${ticker.toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setImgState("idle");
    } catch {
      setImgState("error");
      setTimeout(() => setImgState("idle"), 2500);
    }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(pageUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  const copyImageLabel =
    imgState === "loading"
      ? "Generating…"
      : imgState === "copied"
      ? "Copied!"
      : imgState === "error"
      ? "Failed — try again"
      : "Copy card image";

  const rowClass =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-60";

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => {
            if (!v) {
              // Reopening should always pull a fresh card, never a stale blob.
              blobRef.current = null;
              prefetch();
            }
            return !v;
          });
        }}
        onMouseEnter={prefetch}
        aria-label="Share this stock"
        aria-expanded={open}
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-colors ${
          open
            ? "bg-surface-container-low text-on-surface"
            : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="12" cy="3.2" r="1.8" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="4" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="12.8" r="1.8" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.3 4.3L5.7 6.9M5.7 9.1l4.6 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Share
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-xl border border-outline-variant bg-surface p-1.5 shadow-[0_12px_32px_rgba(17,24,39,0.12)]">
          <button type="button" onClick={handleCopyImage} disabled={imgState === "loading"} className={rowClass}>
            {imgState === "copied" ? (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="text-[#10b981]">
                <path d="M3 8.2l3.2 3.2L13 4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="text-on-surface-variant">
                <rect x="1.8" y="1.8" width="8.6" height="8.6" rx="2" stroke="currentColor" strokeWidth="1.4" />
                <rect x="5.6" y="5.6" width="8.6" height="8.6" rx="2" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            )}
            {copyImageLabel}
          </button>

          <button type="button" onClick={handleCopyLink} className={rowClass}>
            {linkCopied ? (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="text-[#10b981]">
                <path d="M3 8.2l3.2 3.2L13 4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="text-on-surface-variant">
                <path d="M6.5 8.5a3 3 0 004.4.3l1.6-1.6a3 3 0 00-4.2-4.2l-.9.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M9.5 7.5a3 3 0 00-4.4-.3L3.5 8.8a3 3 0 004.2 4.2l.9-.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            )}
            {linkCopied ? "Link copied!" : "Copy link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
