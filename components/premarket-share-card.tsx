"use client";

import { useEffect, useRef, useState } from "react";

type ImageState = "idle" | "loading" | "copied" | "error";

export function PremarketShareCard() {
  const [open, setOpen] = useState(false);
  const [imageState, setImageState] = useState<ImageState>("idle");
  const [copiedLink, setCopiedLink] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<Blob | null>(null);
  const pendingRef = useRef<Promise<Blob> | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [open]);

  function getCard(): Promise<Blob> {
    if (blobRef.current) return Promise.resolve(blobRef.current);
    if (pendingRef.current) return pendingRef.current;
    const pending = fetch("/api/premarket-share?format=social", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`share image returned ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        blobRef.current = blob;
        return blob;
      })
      .finally(() => {
        pendingRef.current = null;
      });
    pendingRef.current = pending;
    return pending;
  }

  function prefetch() {
    getCard().catch(() => {});
  }

  function download(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "stocksbrew-us-premarket.png";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  async function copyImage() {
    setImageState("loading");
    try {
      const blob = await getCard();
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setImageState("copied");
      } else {
        download(blob);
        setImageState("idle");
      }
    } catch {
      setImageState("error");
    }
    window.setTimeout(() => setImageState("idle"), 2400);
  }

  async function downloadImage() {
    try {
      download(await getCard());
    } catch {
      setImageState("error");
      window.setTimeout(() => setImageState("idle"), 2400);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setCopiedLink(false);
    }
  }

  function shareOnX() {
    const text = "US opening setup — futures, global markets and pre-market breadth.";
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  const imageLabel = imageState === "loading" ? "Generating…" : imageState === "copied" ? "Image copied" : imageState === "error" ? "Try again" : "Copy image";
  const rowClass = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-60";

  return (
    <div ref={wrapRef} className="relative shrink-0" data-screenshot-exclude>
      <button
        type="button"
        onClick={() => {
          setOpen((current) => {
            if (!current) {
              blobRef.current = null;
              prefetch();
            }
            return !current;
          });
        }}
        onMouseEnter={prefetch}
        aria-label="Share opening report"
        aria-expanded={open}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-colors ${open ? "bg-surface-container-low text-on-surface" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"}`}
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
        <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-xl border border-outline-variant bg-surface p-1.5 shadow-[0_12px_32px_rgba(17,24,39,0.12)]">
          <button type="button" onClick={copyImage} disabled={imageState === "loading"} className={rowClass}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="text-on-surface-variant">
              <rect x="1.8" y="1.8" width="8.6" height="8.6" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <rect x="5.6" y="5.6" width="8.6" height="8.6" rx="2" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            {imageLabel}
          </button>
          <button type="button" onClick={downloadImage} className={rowClass}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="text-on-surface-variant">
              <path d="M8 2v8m0 0 3-3m-3 3L5 7M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Download PNG
          </button>
          <button type="button" onClick={shareOnX} className={rowClass}>
            <span className="w-[15px] text-center text-[13px] font-bold text-on-surface-variant">𝕏</span>
            Share on X
          </button>
          <button type="button" onClick={copyLink} className={rowClass}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="text-on-surface-variant">
              <path d="M6.5 8.5a3 3 0 004.4.3l1.6-1.6a3 3 0 00-4.2-4.2l-.9.9M9.5 7.5a3 3 0 00-4.4-.3L3.5 8.8a3 3 0 004.2 4.2l.9-.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            {copiedLink ? "Link copied" : "Copy link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
