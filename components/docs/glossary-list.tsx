"use client";

import * as React from "react";

import { Inline } from "@/components/docs/inline";
import { AppLink } from "@/components/oa/app-link";

export type GlossaryRow = { term: string; id: string; text: string; letter: string; see: { href: string; title: string } | null };

/** The glossary with a filter box and letter jumps. Renders in full without JavaScript. */
export function GlossaryList({ rows }: { rows: GlossaryRow[] }) {
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle ? rows.filter((row) => row.term.toLowerCase().includes(needle) || row.text.toLowerCase().includes(needle)) : rows;
  const letters = [...new Set(rows.map((row) => row.letter))];
  const firstOfLetter = new Map<string, string>();
  for (const row of shown) if (!firstOfLetter.has(row.letter)) firstOfLetter.set(row.letter, row.id);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="oa-surface flex h-9 items-center gap-2 border border-oa-border bg-oa-card px-2.5 focus-within:border-[color-mix(in_srgb,var(--oa-ring)_70%,transparent)] sm:w-64">
          <span className="sr-only">Filter terms</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter terms"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-oa-fg outline-none placeholder:text-oa-muted-fg [&::-webkit-search-cancel-button]:hidden"
          />
          <span className="oa-mono shrink-0 text-[11.5px] tabular-nums text-oa-muted-fg">
            {shown.length}/{rows.length}
          </span>
        </label>
        <nav aria-label="Jump to letter" className="flex flex-wrap gap-1">
          {letters.map((letter) => {
            const target = firstOfLetter.get(letter);
            return target ? (
              <a
                key={letter}
                href={`#${target}`}
                className="oa-mono inline-flex size-7 items-center justify-center rounded border border-oa-border bg-oa-card text-[12px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]"
              >
                {letter}
              </a>
            ) : (
              <span key={letter} className="oa-mono inline-flex size-7 items-center justify-center rounded border border-transparent text-[12px] text-oa-muted-fg/50">
                {letter}
              </span>
            );
          })}
        </nav>
      </div>

      {shown.length === 0 ? (
        <p className="oa-surface border border-oa-border bg-oa-card px-4 py-8 text-center text-[14.5px] text-oa-muted-fg">
          No term matches “{query}”. If it is a word we use in the product and it is missing here, tell us and we will add it.
        </p>
      ) : (
        <dl className="oa-surface border border-oa-border bg-oa-card">
          {shown.map((row) => (
            <div
              key={row.id}
              id={row.id}
              className="grid scroll-mt-24 gap-x-5 gap-y-0.5 border-b border-oa-border px-4 py-3 last:border-b-0 target:bg-[color-mix(in_srgb,var(--oa-primary)_9%,transparent)] sm:grid-cols-[12rem_minmax(0,1fr)]"
            >
              <dt className="text-[15.5px] font-medium leading-6 text-oa-fg">{row.term}</dt>
              <dd className="text-pretty text-[15px] leading-6 text-oa-fg/85">
                <Inline text={row.text} />
                {row.see ? (
                  <>
                    {" "}
                    <span className="text-[13.5px] text-oa-muted-fg">
                      More in{" "}
                      <AppLink href={row.see.href} className="font-medium text-oa-primary hover:underline">
                        {row.see.title}
                      </AppLink>
                      .
                    </span>
                  </>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
