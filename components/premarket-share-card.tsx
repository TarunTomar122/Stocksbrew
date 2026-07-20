"use client";

import { useState } from "react";

type ImageState = "idle" | "loading" | "copied" | "error";

export function PremarketShareCard() {
  const [imageState, setImageState] = useState<ImageState>("idle");
  const [copiedLink, setCopiedLink] = useState(false);

  async function getCard(): Promise<Blob> {
    const response = await fetch("/api/premarket-share", { cache: "no-store" });
    if (!response.ok) throw new Error(`share image returned ${response.status}`);
    return response.blob();
  }

  function download(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "stocksbrew-us-opening-report.png";
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
    window.setTimeout(() => setImageState("idle"), 2600);
  }

  async function downloadImage() {
    try {
      download(await getCard());
    } catch {
      setImageState("error");
      window.setTimeout(() => setImageState("idle"), 2600);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      // A copied image or downloaded file remains available when clipboard access is blocked.
    }
  }

  function shareOnX() {
    const url = window.location.href;
    const text = "US opening setup: futures, global markets and pre-market breadth in one quick read.";
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  const copyLabel =
    imageState === "loading"
      ? "Making card…"
      : imageState === "copied"
      ? "Image copied"
      : imageState === "error"
      ? "Try download"
      : "Copy image";

  return (
    <div className="flex flex-wrap items-center gap-2" data-screenshot-exclude>
      <button
        type="button"
        onClick={copyImage}
        disabled={imageState === "loading"}
        className="inline-flex items-center gap-2 rounded-full bg-[#10231f] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#1b3831] disabled:cursor-wait disabled:opacity-70"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2" y="2" width="8.5" height="8.5" rx="1.8" stroke="currentColor" strokeWidth="1.4" />
          <rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.8" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        {copyLabel}
      </button>
      <button
        type="button"
        onClick={shareOnX}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#d8e3df] bg-white px-3.5 py-2 text-[12px] font-semibold text-[#29443c] transition-colors hover:bg-[#f4f8f6]"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M12.6 1h2.4L9.72 6.62 16 15h-4.44l-3.78-4.94L3.48 15H1.06l5.64-6.01L0 1h4.56l3.42 4.47L12.6 1zm-.84 12.6h1.32L4.26 2.36H2.84l8.92 11.24z" />
        </svg>
        Share on X
      </button>
      <button
        type="button"
        onClick={downloadImage}
        className="rounded-full px-2.5 py-2 text-[12px] font-medium text-[#5e746c] transition-colors hover:bg-white hover:text-[#29443c]"
      >
        Download
      </button>
      <button
        type="button"
        onClick={copyLink}
        className="rounded-full px-2.5 py-2 text-[12px] font-medium text-[#5e746c] transition-colors hover:bg-white hover:text-[#29443c]"
      >
        {copiedLink ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}
