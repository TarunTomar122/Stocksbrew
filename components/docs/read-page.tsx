import * as React from "react";

import { DocBlocks } from "@/components/docs/blocks";
import { AppPage, FOCUS } from "@/components/oa/kit";
import { plain } from "@/lib/docs/build";
import type { Block } from "@/lib/docs/types";

/**
 * A page that is read, not scanned: reading width, a larger title, an
 * optional contents list and the shared block renderer. Used by About,
 * Security and the legal pages.
 */
export function ReadPage({
  label,
  title,
  lede,
  meta,
  blocks,
  contents = true,
  before,
  intro,
  after,
}: {
  label?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  /** A small mono line under the lede: dates, who wrote it. */
  meta?: React.ReactNode;
  blocks: Block[];
  /** Show a contents list built from the h2 blocks. */
  contents?: boolean;
  before?: React.ReactNode;
  /** Sits between the header and the contents list. */
  intro?: React.ReactNode;
  after?: React.ReactNode;
}) {
  const headings = blocks.flatMap((block) => (block.t === "h2" ? [{ id: block.id, text: plain(block.text) }] : []));
  return (
    <AppPage width="read">
      {/* 41rem holds body text at about 70 characters a line. */}
      <article className="mx-auto max-w-[41rem]">
        {before}
        <header className="mb-6">
          {label ? <p className="mb-1 text-[12.5px] leading-4 text-oa-muted-fg">{label}</p> : null}
          <h1 className="text-balance text-[24px] font-semibold leading-8 tracking-[-0.01em] text-oa-fg sm:text-[28px] sm:leading-9">{title}</h1>
          {lede ? <p className="mt-2 text-pretty text-[17px] leading-7 text-oa-muted-fg">{lede}</p> : null}
          {meta ? <p className="mt-2 text-[12.5px] leading-4 text-oa-muted-fg">{meta}</p> : null}
        </header>
        {intro ? <div className="mb-7">{intro}</div> : null}
        {contents && headings.length > 2 ? (
          <nav aria-label="Contents" className="oa-surface mb-8 border border-oa-border bg-oa-card px-4 py-3">
            <p className="oa-caption mb-1.5">Contents</p>
            <ol className="grid gap-x-6 sm:grid-cols-2">
              {headings.map((heading, index) => (
                <li key={heading.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)] py-0.5">
                  <span className="oa-mono pt-0.5 text-[12.5px] tabular-nums text-oa-muted-fg">{String(index + 1).padStart(2, "0")}</span>
                  <a href={`#${heading.id}`} className={`rounded text-[14px] leading-6 text-oa-fg hover:underline ${FOCUS}`}>
                    {heading.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <DocBlocks blocks={blocks} />
        {after}
      </article>
    </AppPage>
  );
}
