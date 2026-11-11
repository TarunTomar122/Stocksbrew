import * as React from "react";

import type { ResearchSource } from "@/lib/research/types";

/**
 * Text with [S3] markers turned into small numbered links to the source
 * itself, with the source's name on hover. Unknown markers were already
 * removed by the numbers check.
 */
export function Cited({ text, sources }: { text: string; sources: Map<string, ResearchSource> }) {
  // "high [S3]." reads as "high³." The space before a marker is dropped.
  // Markers written before the full stop ("year [S7]." ) move after it, so the numbers sit like footnotes.
  const parts = text
    .replace(/((?:\s*\[S\d+\])+)\s*([.,;:!?])/g, "$2$1")
    .replace(/\s+(?=\[S\d+\])/g, "")
    .split(/(\[S\d+\])/g);
  return (
    <>
      {parts.map((part, index) => {
        const match = /^\[(S\d+)\]$/.exec(part);
        if (!match) return <React.Fragment key={index}>{part}</React.Fragment>;
        const source = sources.get(match[1]!);
        if (!source) return null;
        const label = source.id.slice(1);
        const external = Boolean(source.url && /^https?:/.test(source.url));
        return (
          <sup key={index} className="ml-px">
            {source.url ? (
              <a
                href={source.url}
                title={source.label}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="oa-mono rounded px-[1px] text-[10.5px] font-medium text-oa-primary no-underline hover:bg-oa-accent hover:underline"
              >
                {label}
              </a>
            ) : (
              <span title={source.label} className="oa-mono px-0.5 text-[10.5px] text-oa-muted-fg">
                {label}
              </span>
            )}
          </sup>
        );
      })}
    </>
  );
}

/** The first sentence of a block, without markers, for a collapsed section's teaser. */
export function teaser(text: string | undefined): string {
  if (!text) return "";
  const clean = text.replace(/\s*\[S\d+\]/g, "").replace(/\s+/g, " ").trim();
  const stop = clean.search(/(?<=[.!?])\s+(?=[A-Z0-9"“'(\[$])/);
  return stop > 0 ? clean.slice(0, stop) : clean;
}
