"use client";

import { useState } from "react";
import { toBlob } from "html-to-image";

type PillarData = {
  score: number;
  verdict: string;
};

type Props = {
  ticker: string;
  /** ID of the card DOM element to screenshot */
  cardElementId?: string;
  // kept for the tweet URL only
  verdict?: string;
  score?: number;
  valuation?: PillarData;
  growth?: PillarData;
  quality?: PillarData;
  momentum?: PillarData;
};

export function ShouldIBuyShare({ ticker, cardElementId = "should-i-buy-card" }: Props) {
  const [imgState, setImgState] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const [linkCopied, setLinkCopied] = useState(false);
  const [xState, setXState] = useState<"idle" | "loading" | "done">("idle");

  const pageUrl =
    typeof window !== "undefined"
      ? window.location.href
      : `https://www.stocksbrew.online/should-i-buy/${ticker}`;

  async function getImageBlob(): Promise<Blob> {
    const el = document.getElementById(cardElementId);
    if (!el) throw new Error("Card element not found");

    // 1. Hide action buttons
    const excluded = Array.from(
      el.querySelectorAll<HTMLElement>("[data-screenshot-exclude]"),
    );
    excluded.forEach((n) => (n.style.display = "none"));

    // 2. Widen card for more text breathing room.
    //    html-to-image's SVG foreignObject measures glyphs slightly wider than
    //    the browser, so bullet text that fits on one line in the UI wraps in
    //    the image. A wider capture container gives enough slack to prevent this.
    const prevWidth = el.style.width;
    el.style.width = "520px";

    // 3. Prevent flex/text wrapping — html-to-image's SVG foreignObject
    //    renderer measures text slightly wider than the browser, causing flex
    //    rows to break prematurely. Fix the verdict row and score pill directly.
    const h2 = el.querySelector<HTMLElement>("h2");
    const verdictRow = h2?.parentElement as HTMLElement | null;
    const prevH2WS = h2?.style.whiteSpace ?? "";
    const prevRowWrap = verdictRow?.style.flexWrap ?? "";
    if (h2) h2.style.whiteSpace = "nowrap";
    if (verdictRow) verdictRow.style.flexWrap = "nowrap";

    // Also fix score pill spans (the "/ 100" span can drop to a new line)
    const scorePillSpans = Array.from(
      el.querySelectorAll<HTMLElement>("[data-score-pill] span"),
    );
    const prevSpanWS = scorePillSpans.map((s) => s.style.whiteSpace);
    scorePillSpans.forEach((s) => (s.style.whiteSpace = "nowrap"));


    // 4. Proxy-inline all <img> elements to avoid CORS canvas taint.
    //    We fetch each logo through our own /api/logo-proxy route, convert it
    //    to a data URL, and swap the src temporarily so html-to-image can
    //    render the real logo without CORS restrictions.
    const imgEls = Array.from(el.querySelectorAll<HTMLImageElement>("img"));
    const prevSrcs = imgEls.map((img) => img.src);
    await Promise.all(
      imgEls.map(async (img) => {
        try {
          const res = await fetch(
            `/api/logo-proxy?url=${encodeURIComponent(img.src)}`,
          );
          if (!res.ok) return;
          const imgBlob = await res.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(imgBlob);
          });
          img.src = dataUrl;
        } catch {
          // If proxy fails for any image, leave it — toBlob will skip tainted images gracefully
        }
      }),
    );

    // 5. Inject footer
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      padding: "10px 24px 14px",
      textAlign: "center",
      background: "white",
      borderTop: "1px solid #f3f4f6",
    });
    footer.innerHTML = `<span style="font-size:11px;color:#9ca3af;font-family:inherit;font-weight:500;">www.stocksbrew.online/should-i-buy</span>`;
    const whiteBottom = el.lastElementChild as HTMLElement | null;
    (whiteBottom ?? el).appendChild(footer);

    try {
      const blob = await toBlob(el, {
        pixelRatio: 2,
        // No IMG filter needed — images are now inlined as data URLs
      });
      if (!blob) throw new Error("toBlob returned null");
      return blob;
    } finally {
      excluded.forEach((n) => (n.style.display = ""));
      el.style.width = prevWidth;
      if (h2) h2.style.whiteSpace = prevH2WS;
      if (verdictRow) verdictRow.style.flexWrap = prevRowWrap;
      scorePillSpans.forEach((s, i) => (s.style.whiteSpace = prevSpanWS[i]));
      imgEls.forEach((img, i) => (img.src = prevSrcs[i]));
      footer.remove();
    }
  }

  function triggerDownloadFromBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stocksbrew-${ticker.toLowerCase()}-should-i-buy.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleCopyImage() {
    setImgState("loading");
    try {
      const blob = await getImageBlob();
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setImgState("copied");
          setTimeout(() => setImgState("idle"), 3000);
          return;
        } catch {
          // clipboard write failed - fall through to download
        }
      }
      // fallback: download
      triggerDownloadFromBlob(blob);
      setImgState("idle");
    } catch {
      setImgState("error");
      setTimeout(() => setImgState("idle"), 3000);
    }
  }

  async function handleDownload() {
    try {
      const blob = await getImageBlob();
      triggerDownloadFromBlob(blob);
    } catch {
      // silent
    }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(pageUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  const tweetText = encodeURIComponent(`Should I buy ${ticker}? Here's what the data says:`);
  const tweetHref = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(pageUrl)}`;

  async function handleShareOnX() {
    setXState("loading");
    try {
      const blob = await getImageBlob();
      // Copy image to clipboard so user can paste it into the tweet
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        } catch {
          // If clipboard fails, continue anyway — tweet window still opens
        }
      }
    } catch {
      // Image gen failed — still open tweet window
    }
    setXState("done");
    setTimeout(() => setXState("idle"), 4000);
    window.open(tweetHref, "_blank", "noopener,noreferrer");
  }

  const imgBtnContent = {
    idle: (
      <>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="1.5" y="1.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <rect x="5.5" y="5.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        Copy card image
      </>
    ),
    loading: (
      <>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="animate-spin">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 20" strokeLinecap="round" />
        </svg>
        Generating…
      </>
    ),
    copied: (
      <>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Copied!
      </>
    ),
    error: (
      <>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M8 5v4M8 11h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        Failed - try download
      </>
    ),
  }[imgState];

  const imgBtnStyle =
    imgState === "copied"
      ? "bg-[#10b981] border-[#10b981] text-white"
      : imgState === "error"
      ? "bg-[#fef2f2] border-[#fca5a5] text-[#991b1b]"
      : imgState === "loading"
      ? "bg-[#f9fafb] border-[#e5e7eb] text-[#6b7280] cursor-wait"
      : "bg-[#111111] border-[#111111] text-white hover:bg-[#1f1f1f]";

  return (
    <div className="flex flex-col gap-3">
      {/* Primary: copy image */}
      <button
        onClick={handleCopyImage}
        disabled={imgState === "loading"}
        className={`w-full flex items-center justify-center gap-2 rounded-[14px] border px-5 py-3.5 text-[14px] font-semibold transition-all ${imgBtnStyle}`}
      >
        {imgBtnContent}
      </button>

      {/* Secondary actions */}
      <div className="flex gap-2">
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 rounded-[11px] border border-[#e5e7eb] bg-white px-4 py-2.5 text-[12px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
            <path d="M6.5 1v7M4.5 6.5l2 2 2-2" stroke="#6b7280" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M1.5 10.5h10" stroke="#6b7280" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Download
        </button>

        <button
          onClick={handleShareOnX}
          disabled={xState === "loading"}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-[11px] px-4 py-2.5 text-[12px] font-medium transition-colors ${
            xState === "done"
              ? "bg-[#10b981] text-white"
              : xState === "loading"
              ? "bg-[#333] text-white cursor-wait"
              : "bg-black text-white hover:bg-[#1a1a1a]"
          }`}
        >
          {xState === "loading" ? (
            <>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden className="animate-spin">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 20" strokeLinecap="round" />
              </svg>
              Copying…
            </>
          ) : xState === "done" ? (
            <>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                <path d="M2 6.5l2.5 2.5 5.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Paste image in tweet!
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M12.6 1h2.4L9.72 6.62 16 15h-4.44l-3.78-4.94L3.48 15H1.06l5.64-6.01L0 1h4.56l3.42 4.47L12.6 1zm-.84 12.6h1.32L4.26 2.36H2.84l8.92 11.24z" />
              </svg>
              Share on X
            </>
          )}
        </button>

        <button
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 rounded-[11px] border border-[#e5e7eb] bg-white px-4 py-2.5 text-[12px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors"
        >
          {linkCopied ? (
            <>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                <path d="M2 6.5l2.5 2.5 5.5-5" stroke="#10b981" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                <path d="M5 6.5a2.5 2.5 0 003.7.3l1.3-1.3a2.5 2.5 0 00-3.5-3.5l-.7.7" stroke="#6b7280" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M8 6.5a2.5 2.5 0 01-3.7-.3L3 4.9a2.5 2.5 0 013.5 3.5l-.7.7" stroke="#6b7280" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Copy link
            </>
          )}
        </button>
      </div>
    </div>
  );
}
