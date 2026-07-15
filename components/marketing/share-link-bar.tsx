"use client";

import { useState } from "react";

type Props = {
  url: string;
  title: string;
};

export function ShareLinkBar({ url, title }: Props) {
  const [copied, setCopied] = useState(false);
  const absolute = url.startsWith("http") ? url : `https://www.stocksbrew.online${url.startsWith("/") ? url : `/${url}`}`;
  const encoded = encodeURIComponent(absolute);
  const text = encodeURIComponent(title);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-[#fafaf7] p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">Share this page</p>
        <p className="mt-1 text-[13px] text-[#374151] truncate">{absolute}</p>
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
        <button
          type="button"
          onClick={() => void copyLink()}
          className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#111111] hover:border-[#111111] transition-colors"
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        <a
          href={`https://www.reddit.com/submit?url=${encoded}&title=${text}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111] transition-colors"
        >
          Reddit ↗
        </a>
        <a
          href={`https://twitter.com/intent/tweet?url=${encoded}&text=${text}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-[36px] items-center px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-medium text-[#374151] hover:border-[#111111] transition-colors"
        >
          Post ↗
        </a>
      </div>
    </section>
  );
}
