"use client";

import * as React from "react";

import type { SearchEntry } from "@/lib/docs/types";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";

type QuickEntry = Pick<SearchEntry, "href" | "title" | "group" | "summary">;
type Hit = QuickEntry & { snippet: string | null; score: number };

const MAX_HITS = 8;

function tokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part.length > 0);
}

/** Title beats summary beats body. Every word of the query has to appear somewhere. */
function scoreEntry(entry: QuickEntry & { text?: string }, words: string[]): { score: number; snippet: string | null } | null {
  const title = entry.title.toLowerCase();
  const summary = entry.summary.toLowerCase();
  const body = (entry.text ?? "").toLowerCase();
  let score = 0;
  let bodyAt = -1;
  for (const word of words) {
    const inTitle = title.indexOf(word);
    const inSummary = summary.indexOf(word);
    const inBody = body.indexOf(word);
    if (inTitle < 0 && inSummary < 0 && inBody < 0) return null;
    if (inTitle >= 0) score += inTitle === 0 || title[inTitle - 1] === " " ? 12 : 8;
    if (inSummary >= 0) score += 4;
    if (inBody >= 0) {
      score += 1;
      if (inTitle < 0 && inSummary < 0 && bodyAt < 0) bodyAt = inBody;
    }
  }
  let snippet: string | null = null;
  if (bodyAt >= 0 && entry.text) {
    const start = Math.max(0, entry.text.lastIndexOf(" ", Math.max(0, bodyAt - 50)));
    const end = Math.min(entry.text.length, bodyAt + 110);
    snippet = `${start > 0 ? "…" : ""}${entry.text.slice(start, end).trim()}${end < entry.text.length ? "…" : ""}`;
  }
  return { score, snippet };
}

function Highlight({ text, words }: { text: string; words: string[] }) {
  if (words.length === 0) return <>{text}</>;
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "ig"));
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded-sm bg-[color-mix(in_srgb,var(--oa-primary)_22%,transparent)] text-oa-fg">
            {part}
          </mark>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

/**
 * Search over every guide and glossary term. Titles and summaries ship with
 * the page, so results appear at once; the full text is fetched the first
 * time the box is focused and widens the match to the body of every guide.
 */
export function DocsSearch({ quick, autoFocus = false, className = "" }: { quick: QuickEntry[]; autoFocus?: boolean; className?: string }) {
  const [query, setQuery] = React.useState("");
  const [full, setFull] = React.useState<SearchEntry[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const requested = React.useRef(false);
  const root = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();

  const loadFull = React.useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    fetch("/docs/search-index.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { entries?: SearchEntry[] } | null) => {
        if (data && Array.isArray(data.entries)) setFull(data.entries);
        else requested.current = false;
      })
      .catch(() => {
        requested.current = false;
      });
  }, []);

  React.useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      // "/" focuses the docs search, the way most documentation sites do.
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      // Only the first search box on the page takes the shortcut.
      if (document.querySelector("[data-docs-search]") !== input.current) return;
      event.preventDefault();
      input.current?.focus();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const words = React.useMemo(() => tokens(query), [query]);
  const hits = React.useMemo<Hit[]>(() => {
    if (words.length === 0) return [];
    const source: Array<QuickEntry & { text?: string }> = full ?? quick;
    const out: Hit[] = [];
    for (const entry of source) {
      const scored = scoreEntry(entry, words);
      if (scored) out.push({ href: entry.href, title: entry.title, group: entry.group, summary: entry.summary, ...scored });
    }
    return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, MAX_HITS);
  }, [words, full, quick]);

  React.useEffect(() => setActive(0), [query]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (hits.length === 0 ? 0 : (index + 1) % hits.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (hits.length === 0 ? 0 : (index - 1 + hits.length) % hits.length));
    } else if (event.key === "Enter") {
      const hit = hits[active];
      if (hit) {
        event.preventDefault();
        window.location.assign(hit.href);
      }
    } else if (event.key === "Escape") {
      if (query) setQuery("");
      else input.current?.blur();
      setOpen(false);
    }
  }

  const showPanel = open && words.length > 0;

  return (
    <div ref={root} className={`relative ${className}`}>
      <label className="oa-surface flex h-9 items-center gap-2 border border-oa-border bg-oa-card px-2.5 focus-within:border-[color-mix(in_srgb,var(--oa-ring)_70%,transparent)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="size-4 shrink-0 text-oa-muted-fg">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <span className="sr-only">Search the docs</span>
        <input
          ref={input}
          data-docs-search=""
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            loadFull();
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search the docs"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-oa-fg outline-none placeholder:text-oa-muted-fg [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd className="oa-mono hidden h-5 items-center rounded border border-oa-border px-1.5 text-[11px] text-oa-muted-fg sm:inline-flex">/</kbd>
      </label>

      {showPanel ? (
        <div
          id={listId}
          role="listbox"
          className="oa-surface absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-[70vh] overflow-y-auto border border-oa-border bg-oa-card shadow-[0_12px_32px_rgba(0,0,0,0.14)]"
        >
          {hits.length === 0 ? (
            <p className="px-3 py-4 text-[14px] leading-5 text-oa-muted-fg">
              Nothing in the docs matches “{query}”. Try a shorter word, or open the{" "}
              <Link prefetch={false} href="/docs/glossary" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-2">
                glossary
              </Link>
              .
            </p>
          ) : (
            hits.map((hit, index) => (
              <AppLink
                key={hit.href}
                href={hit.href}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                className={`block border-b border-oa-border px-3 py-2 last:border-b-0 ${index === active ? "bg-oa-accent" : ""}`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[14.5px] font-medium text-oa-fg">
                    <Highlight text={hit.title} words={words} />
                  </span>
                  <span className="oa-mono shrink-0 text-[10.5px] uppercase tracking-[0.06em] text-oa-label">{hit.group}</span>
                </span>
                <span className="mt-0.5 line-clamp-2 block text-[13px] leading-5 text-oa-muted-fg">
                  <Highlight text={hit.snippet ?? hit.summary} words={words} />
                </span>
              </AppLink>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
