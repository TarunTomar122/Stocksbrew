"use client";

import { useState } from "react";

import { LINKABLE_ASSETS, REDDIT_OUTREACH_TEMPLATES } from "@/lib/seo/linkable-assets";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex h-8 items-center rounded-full border border-oa-border bg-oa-card px-3.5 text-[13px] font-medium text-oa-muted-fg transition-colors hover:border-oa-fg/30 hover:text-oa-fg"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function ResourcesCiteSection() {
  return (
    <section className="flex flex-col gap-10">
      <div className="flex max-w-2xl flex-col gap-3">
        <h2 className="text-[22px] font-medium tracking-tight text-oa-fg">Link and share stocksbrew</h2>
        <p className="text-sm leading-relaxed text-oa-muted-fg">
          Free tools and guides you can cite in blog posts, Reddit comments, or newsletters. Copy the URL or outreach blurb. No affiliate links.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {LINKABLE_ASSETS.map((asset) => {
          const url = `https://www.stocksbrew.online${asset.href}`;
          return (
            <div
              key={asset.href}
              className="flex flex-col gap-3 rounded-[22px] border border-oa-border bg-oa-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
            >
              <div>
                <h3 className="text-[16px] font-medium tracking-tight text-oa-fg">{asset.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-oa-muted-fg">{asset.description}</p>
              </div>
              <p className="text-xs text-oa-muted-fg">
                Suggested anchor: <span className="font-medium text-oa-fg">{asset.suggestedAnchor}</span>
              </p>
              <p className="oa-mono break-all text-xs text-oa-muted-fg">{url}</p>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={url} label="Copy URL" />
                <CopyButton text={asset.outreachBlurb} label="Copy blurb" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-4 rounded-[22px] border border-oa-border bg-oa-bg p-6 sm:p-8">
        <h3 className="text-[17px] font-medium tracking-tight text-oa-fg">Community outreach templates</h3>
        <p className="text-sm leading-relaxed text-oa-muted-fg">
          Edit before posting. These are starting points for genuine answers, not spam. Post only when relevant to the thread.
        </p>
        <div className="flex flex-col gap-3">
          {REDDIT_OUTREACH_TEMPLATES.map((tpl) => (
            <div key={tpl.title} className="flex flex-col gap-2 rounded-[18px] border border-oa-border bg-oa-card p-4">
              <p className="text-[13px] font-medium text-oa-fg">{tpl.title}</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-oa-muted-fg">{tpl.body}</p>
              <CopyButton text={tpl.body} label="Copy template" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
