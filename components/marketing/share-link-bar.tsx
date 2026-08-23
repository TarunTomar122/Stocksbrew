"use client";

import { useState } from "react";

type Props = {
  url: string;
  title: string;
};

const PILL =
  "inline-flex h-8 items-center rounded-full border border-oa-border bg-oa-bg px-3.5 text-[13px] font-medium text-oa-muted-fg transition-colors hover:border-oa-fg/30 hover:text-oa-fg";

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
    <section className="flex flex-col gap-3 rounded-[22px] border border-oa-border bg-oa-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="oa-mono text-[10px] uppercase tracking-[0.12em] text-oa-muted-fg">Share this page</p>
        <p className="oa-mono mt-1 truncate text-[13px] text-oa-fg/70">{absolute}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button type="button" onClick={() => void copyLink()} className={PILL}>
          {copied ? "Copied" : "Copy link"}
        </button>
        <a
          href={`https://www.reddit.com/submit?url=${encoded}&title=${text}`}
          target="_blank"
          rel="noopener noreferrer"
          className={PILL}
        >
          Reddit ↗
        </a>
        <a
          href={`https://twitter.com/intent/tweet?url=${encoded}&text=${text}`}
          target="_blank"
          rel="noopener noreferrer"
          className={PILL}
        >
          Post ↗
        </a>
      </div>
    </section>
  );
}
