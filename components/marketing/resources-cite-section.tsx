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
      className="inline-flex h-[32px] items-center px-3 rounded-full border border-outline-variant bg-surface text-[12px] font-medium text-on-surface hover:border-on-surface/30 transition-colors"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

export function ResourcesCiteSection() {
  return (
    <section className="flex flex-col gap-10">
      <div className="max-w-2xl flex flex-col gap-3">
        <h2 className="text-xl font-bold text-on-surface">Link & share stocksbrew</h2>
        <p className="text-[14px] leading-relaxed text-on-surface-variant">
          Free tools and guides you can cite in blog posts, Reddit comments, or newsletters. Copy the URL or outreach blurb — no affiliate links.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {LINKABLE_ASSETS.map((asset) => {
          const url = `https://www.stocksbrew.online${asset.href}`;
          return (
            <div
              key={asset.href}
              className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface p-5"
            >
              <div>
                <h3 className="text-[16px] font-semibold text-on-surface">{asset.title}</h3>
                <p className="mt-1 text-[13px] text-on-surface-variant leading-relaxed">{asset.description}</p>
              </div>
              <p className="text-[12px] text-on-surface-variant">
                Suggested anchor: <span className="font-medium text-on-surface">{asset.suggestedAnchor}</span>
              </p>
              <p className="text-[12px] font-mono text-on-surface-variant break-all">{url}</p>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={url} label="Copy URL" />
                <CopyButton text={asset.outreachBlurb} label="Copy blurb" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-6 flex flex-col gap-4">
        <h3 className="text-[17px] font-semibold text-on-surface">Community outreach templates</h3>
        <p className="text-[13px] text-on-surface-variant">
          Edit before posting — these are starting points for genuine answers, not spam. Post only when relevant to the thread.
        </p>
        <div className="flex flex-col gap-4">
          {REDDIT_OUTREACH_TEMPLATES.map((tpl) => (
            <div key={tpl.title} className="rounded-xl border border-outline-variant bg-surface p-4 flex flex-col gap-2">
              <p className="text-[13px] font-semibold text-on-surface">{tpl.title}</p>
              <p className="text-[13px] text-on-surface-variant leading-relaxed whitespace-pre-wrap">{tpl.body}</p>
              <CopyButton text={tpl.body} label="Copy template" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
