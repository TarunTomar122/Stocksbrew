"use client";

import { useMemo, useState } from "react";

import type { NewsArticle } from "@/lib/news";

type Props = {
  articles: NewsArticle[];
  market: "US" | "IN";
};

type SentimentFilter = "all" | "bullish" | "bearish" | "neutral" | "mixed";
type TimeframeFilter = "24h" | "48h" | "7d" | "all";

const PAGE_SIZE = 50;

const SENTIMENT_OPTIONS: { id: SentimentFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "bullish", label: "Bullish" },
  { id: "bearish", label: "Bearish" },
  { id: "neutral", label: "Neutral" },
  { id: "mixed", label: "Mixed" },
];

const TIMEFRAME_OPTIONS: { id: TimeframeFilter; label: string }[] = [
  { id: "24h", label: "24h" },
  { id: "48h", label: "48h" },
  { id: "7d", label: "7d" },
  { id: "all", label: "All" },
];

function sentimentTone(label: string): string {
  const v = label.toLowerCase();
  if (v === "bullish") return "text-signal-bullish";
  if (v === "bearish") return "text-signal-bearish";
  if (v === "mixed") return "text-signal-neutral";
  return "text-on-surface-variant";
}

function sentimentDotBg(label: string): string {
  const v = label.toLowerCase();
  if (v === "bullish") return "bg-signal-bullish";
  if (v === "bearish") return "bg-signal-bearish";
  if (v === "mixed") return "bg-signal-neutral";
  return "bg-outline";
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function withinTimeframe(iso: string, tf: TimeframeFilter): boolean {
  if (tf === "all") return true;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return false;
  const diffHours = (Date.now() - then) / 3_600_000;
  if (tf === "24h") return diffHours <= 24;
  if (tf === "48h") return diffHours <= 48;
  if (tf === "7d") return diffHours <= 24 * 7;
  return true;
}

export function NewsExplorer({ articles, market }: Props) {
  const [query, setQuery] = useState("");
  const [sectors, setSectors] = useState<Set<string>>(new Set());
  const [sources, setSources] = useState<Set<string>>(new Set());
  const [sentiment, setSentiment] = useState<SentimentFilter>("all");
  const [timeframe, setTimeframe] = useState<TimeframeFilter>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);

  // ─── Facet counts ────────────────────────────────────────────────────
  // Derive the sector + source lists from the data itself so we don't
  // hardcode taxonomies that drift from what the pipeline actually emits.
  const sectorCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of articles) {
      for (const tag of a.sector_tags) {
        if (!tag) continue;
        m.set(tag, (m.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [articles]);

  const sourceCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of articles) {
      if (!a.source_name) continue;
      m.set(a.source_name, (m.get(a.source_name) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [articles]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (!withinTimeframe(a.published_at, timeframe)) return false;
      if (sentiment !== "all" && a.sentiment_label.toLowerCase() !== sentiment)
        return false;
      if (sectors.size > 0 && !a.sector_tags.some((t) => sectors.has(t)))
        return false;
      if (sources.size > 0 && !sources.has(a.source_name)) return false;
      if (q) {
        const hay = `${a.title} ${a.summary} ${a.tickers.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [articles, query, sectors, sources, sentiment, timeframe]);

  function toggleFrom(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function resetFilters() {
    setQuery("");
    setSectors(new Set());
    setSources(new Set());
    setSentiment("all");
    setTimeframe("all");
    setVisible(PAGE_SIZE);
  }

  const hasAnyFilter =
    query.trim().length > 0 ||
    sectors.size > 0 ||
    sources.size > 0 ||
    sentiment !== "all" ||
    timeframe !== "all";

  const page = filtered.slice(0, visible);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
      {/* ─── Filter rail ─────────────────────────────────────────────── */}
      <aside className="flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
        <div className="bg-surface-container-lowest brutalist-border p-4 flex flex-col gap-4">
          <div>
            <label className="block text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant mb-1.5">
              Search
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisible(PAGE_SIZE);
              }}
              placeholder="title, summary, ticker…"
              className="w-full bg-surface-container-low border border-outline-variant/40 rounded-md py-2 px-3 text-sm text-on-surface placeholder:text-outline outline-none focus:border-primary"
            />
          </div>

          <div>
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant mb-1.5">
              Timeframe
            </div>
            <div className="grid grid-cols-4 gap-1">
              {TIMEFRAME_OPTIONS.map((opt) => {
                const active = timeframe === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setTimeframe(opt.id);
                      setVisible(PAGE_SIZE);
                    }}
                    className={`px-2 py-1.5 text-[11px] font-bold tracking-[0.12em] uppercase rounded transition-colors ${
                      active
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant mb-1.5">
              Sentiment
            </div>
            <div className="flex flex-wrap gap-1">
              {SENTIMENT_OPTIONS.map((opt) => {
                const active = sentiment === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSentiment(opt.id);
                      setVisible(PAGE_SIZE);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-bold tracking-[0.1em] uppercase rounded transition-colors ${
                      active
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {sectorCounts.length > 0 && (
            <div>
              <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant mb-1.5">
                Sectors
              </div>
              <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto pr-1">
                {sectorCounts.map(([tag, count]) => {
                  const active = sectors.has(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setSectors((s) => toggleFrom(s, tag));
                        setVisible(PAGE_SIZE);
                      }}
                      className={`flex items-center justify-between px-2 py-1 text-[12px] rounded transition-colors ${
                        active
                          ? "bg-primary/15 text-on-surface font-semibold"
                          : "text-on-surface-variant hover:bg-surface-container-low"
                      }`}
                    >
                      <span className="truncate">{tag}</span>
                      <span className="text-[10px] tabular-nums text-outline ml-2">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {sourceCounts.length > 0 && (
            <div>
              <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant mb-1.5">
                Sources
              </div>
              <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto pr-1">
                {sourceCounts.slice(0, 40).map(([src, count]) => {
                  const active = sources.has(src);
                  return (
                    <button
                      key={src}
                      type="button"
                      onClick={() => {
                        setSources((s) => toggleFrom(s, src));
                        setVisible(PAGE_SIZE);
                      }}
                      className={`flex items-center justify-between px-2 py-1 text-[12px] rounded transition-colors ${
                        active
                          ? "bg-primary/15 text-on-surface font-semibold"
                          : "text-on-surface-variant hover:bg-surface-container-low"
                      }`}
                    >
                      <span className="truncate">{src}</span>
                      <span className="text-[10px] tabular-nums text-outline ml-2">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {hasAnyFilter && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] font-bold tracking-[0.15em] uppercase text-on-surface-variant hover:text-on-surface transition-colors self-start"
            >
              Reset filters
            </button>
          )}
        </div>
      </aside>

      {/* ─── Article list ────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3 min-w-0">
        <div className="text-[12px] text-on-surface-variant">
          Showing{" "}
          <span className="font-bold text-on-surface tabular-nums">
            {page.length}
          </span>{" "}
          of{" "}
          <span className="font-bold text-on-surface tabular-nums">
            {filtered.length}
          </span>{" "}
          matching {market} {market === "IN" ? "(₹)" : "($)"}
        </div>

        {page.length === 0 ? (
          <div className="bg-surface-container-lowest brutalist-border p-8 text-center">
            <div className="text-sm font-semibold text-on-surface">
              No articles match your filters.
            </div>
            <div className="text-[12px] text-on-surface-variant mt-1">
              Try widening the timeframe or clearing sector / source picks.
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {page.map((a) => (
              <li key={a.id}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-surface-container-lowest brutalist-border p-4 hover:bg-surface-container-low transition-colors overflow-hidden [overflow-wrap:anywhere]"
                >
                  <div className="flex items-center gap-2 text-[11px] text-on-surface-variant mb-1.5 flex-wrap">
                    <span className="font-bold uppercase tracking-[0.12em]">
                      {a.source_name || "Unknown source"}
                    </span>
                    <span className="text-outline">·</span>
                    <span>{formatRelative(a.published_at)}</span>
                    <span className="text-outline">·</span>
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${sentimentDotBg(a.sentiment_label)}`}
                      />
                      <span
                        className={`font-bold uppercase tracking-[0.12em] ${sentimentTone(a.sentiment_label)}`}
                      >
                        {a.sentiment_label}
                      </span>
                    </span>
                  </div>

                  <h3 className="text-[15px] font-semibold text-on-surface leading-snug">
                    {a.title}
                  </h3>

                  {a.summary && (
                    <p className="mt-1.5 text-[13px] text-on-surface-variant leading-relaxed line-clamp-3">
                      {a.summary}
                    </p>
                  )}

                  {(a.tickers.length > 0 || a.sector_tags.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {a.tickers.slice(0, 6).map((t) => (
                        <span
                          key={`t-${t}`}
                          className="px-1.5 py-0.5 text-[10px] font-bold tracking-[0.1em] rounded bg-primary/15 text-on-surface"
                        >
                          {t}
                        </span>
                      ))}
                      {a.sector_tags.slice(0, 4).map((s) => (
                        <span
                          key={`s-${s}`}
                          className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-surface-container-high text-on-surface-variant"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}

        {visible < filtered.length && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="self-center mt-2 px-5 py-2 text-[11px] font-bold tracking-[0.18em] uppercase bg-surface-container-low brutalist-border hover:bg-surface-container-high transition-colors"
          >
            Load {Math.min(PAGE_SIZE, filtered.length - visible)} more
          </button>
        )}
      </section>
    </div>
  );
}
