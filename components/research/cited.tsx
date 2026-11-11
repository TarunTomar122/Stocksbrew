import * as React from "react";

import { CiteRef } from "@/components/research/cite-ref";
import { day } from "@/lib/research/format";
import type { ResearchSource, ResearchSourceKind } from "@/lib/research/types";

const KIND: Record<ResearchSourceKind, string> = { filing: "Filing", news: "News", data: "Data", ours: "stocksbrew", social: "Social posts" };

/**
 * Text with [S3] markers turned into small numbered citations. Each opens a card at the claim with the
 * source's name, date and link (cite-ref.tsx). Unknown markers were already removed by the numbers check.
 */
export function Cited({ text, sources }: { text: string; sources: Map<string, ResearchSource> }) {
  // "high [S3]." reads as "high³." The space before a marker is dropped.
  // Markers written before the full stop ("year [S7]." ) move after it, so the numbers sit like footnotes.
  const parts = text
    .replace(/((?:\s*\[S\d+\])+)\s*([.,;:!?])/g, "$2$1")
    .replace(/\s+(?=\[S\d+\])/g, "")
    .split(/(\[S\d+\])/g);
  // Each run of markers stays on one line with the word before it: a button is an atomic inline, so the line
  // could otherwise break between "year." and its numbers.
  const out: React.ReactNode[] = [];
  let index = 0;
  while (index < parts.length) {
    const part = parts[index]!;
    if (!/^\[S\d+\]$/.test(part)) {
      const next = parts[index + 1];
      const tail = next && /^\[S\d+\]$/.test(next) ? /\S+$/.exec(part)?.[0] ?? "" : "";
      const head = tail ? part.slice(0, part.length - tail.length) : part;
      if (head) out.push(<React.Fragment key={`t${index}`}>{head}</React.Fragment>);
      index += 1;
      const refs: React.ReactNode[] = [];
      // The markers after this text, with any empty text between them ("[S7][S9]" splits with "" in between).
      while (index < parts.length && (/^\[S\d+\]$/.test(parts[index]!) || (parts[index] === "" && /^\[S\d+\]$/.test(parts[index + 1] ?? "")))) {
        const ref = cite(parts[index]!, sources, index);
        if (ref) refs.push(ref);
        index += 1;
      }
      if (tail || refs.length) {
        out.push(
          <span key={`g${index}`} className="whitespace-nowrap">
            {tail}
            {refs}
          </span>,
        );
      }
      continue;
    }
    const ref = cite(part, sources, index);
    if (ref) out.push(ref);
    index += 1;
  }
  return <>{out}</>;
}

function cite(part: string, sources: Map<string, ResearchSource>, key: number): React.ReactNode {
  const match = /^\[(S\d+)\]$/.exec(part);
  const source = match ? sources.get(match[1]!) : undefined;
  if (!source) return null;
  return (
    <CiteRef
      key={key}
      n={source.id.slice(1)}
      label={source.label}
      kind={KIND[source.kind] ?? null}
      date={source.as_of ? day(source.as_of) || null : null}
      url={source.url}
    />
  );
}

/** The first sentence of a block, without markers, for a collapsed section's teaser. */
export function teaser(text: string | undefined): string {
  if (!text) return "";
  const clean = text.replace(/\s*\[S\d+\]/g, "").replace(/\s+/g, " ").trim();
  const stop = clean.search(/(?<=[.!?])\s+(?=[A-Z0-9"“'(\[$])/);
  return stop > 0 ? clean.slice(0, stop) : clean;
}
