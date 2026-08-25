"use client";

import { useMemo, useState } from "react";

import { StockLogo } from "@/components/stock-logo";
import type { NewsArticle } from "@/lib/news";

type Props = {
  articles: NewsArticle[];
  market: "US" | "IN";
};

type SentimentFilter = "all" | "bullish" | "bearish" | "neutral" | "mixed";
type TimeframeFilter = "24h" | "48h" | "7d" | "all";

const PAGE_SIZE = 30;

const SENTIMENT_OPTIONS: { id: SentimentFilter; label: string; dot: string }[] = [
  { id: "all", label: "All", dot: "var(--oa-muted-fg)" },
  { id: "bullish", label: "Bullish", dot: "var(--signal-bullish)" },
  { id: "bearish", label: "Bearish", dot: "var(--signal-bearish)" },
  { id: "neutral", label: "Neutral", dot: "var(--oa-muted-fg)" },
  { id: "mixed", label: "Mixed", dot: "var(--signal-neutral)" },
];

const TIMEFRAME_OPTIONS: { id: TimeframeFilter; label: string }[] = [
  { id: "24h", label: "24h" },
  { id: "48h", label: "48h" },
  { id: "7d", label: "7d" },
  { id: "all", label: "All" },
];

function sentimentMeta(label: string): { dot: string; tone: string } {
  const v = label.toLowerCase();
  if (v === "bullish") return { dot: "var(--signal-bullish)", tone: "text-[var(--signal-bullish)]" };
  if (v === "bearish") return { dot: "var(--signal-bearish)", tone: "text-[var(--signal-bearish)]" };
  if (v === "mixed") return { dot: "var(--signal-neutral)", tone: "text-[var(--signal-neutral)]" };
  return { dot: "var(--oa-muted-fg)", tone: "text-oa-muted-fg" };
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
      if (sentiment !== "all" && a.sentiment_label.toLowerCase() !== sentiment) return false;
      if (sectors.size > 0 && !a.sector_tags.some((t) => sectors.has(t))) return false;
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
    <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6">
      {/* Filter rail */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-[20px] border border-oa-border bg-oa-card p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-medium tracking-[0.12em] uppercase text-oa-muted-fg">
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
              className="h-10 w-full rounded-lg border border-oa-border bg-oa-card px-3 text-[13px] text-oa-fg placeholder:text-oa-muted-fg outline-none focus:border-oa-fg/30"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-medium tracking-[0.12em] uppercase text-oa-muted-fg">
              Timeframe
            </span>
            <div className="flex gap-1.5 flex-wrap">
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
                    className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${
                      active
                        ? "bg-oa-primary text-white"
                        : "bg-oa-card text-oa-fg border border-oa-border hover:border-oa-fg/30"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-medium tracking-[0.12em] uppercase text-oa-muted-fg">
              Sentiment
            </span>
            <div className="flex flex-wrap gap-1.5">
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
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${
                      active
                        ? "bg-oa-primary text-white"
                        : "bg-oa-card text-oa-fg border border-oa-border hover:border-oa-fg/30"
                    }`}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: opt.dot }}
                      aria-hidden
                    />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {sectorCounts.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium tracking-[0.12em] uppercase text-oa-muted-fg">
                Sectors
              </span>
              <div className="flex flex-col max-h-56 overflow-y-auto pr-1">
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
                      className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-[12px] transition-colors ${
                        active
                          ? "bg-oa-bg text-oa-fg font-medium"
                          : "text-oa-fg hover:bg-oa-accent"
                      }`}
                    >
                      <span className="truncate">{tag}</span>
                      <span className="text-[10px] tabular-nums text-oa-muted-fg ml-2">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {sourceCounts.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium tracking-[0.12em] uppercase text-oa-muted-fg">
                Sources
              </span>
              <div className="flex flex-col max-h-56 overflow-y-auto pr-1">
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
                      className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-[12px] transition-colors ${
                        active
                          ? "bg-oa-bg text-oa-fg font-medium"
                          : "text-oa-fg hover:bg-oa-accent"
                      }`}
                    >
                      <span className="truncate">{src}</span>
                      <span className="text-[10px] tabular-nums text-oa-muted-fg ml-2">
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
              className="text-[12px] font-medium text-oa-primary hover:underline self-start"
            >
              Reset filters
            </button>
          )}
        </div>
      </aside>

      {/* Article list */}
      <section className="flex flex-col gap-3 min-w-0">
        <div className="text-[13px] text-oa-muted-fg">
          Showing{" "}
          <span className="font-medium text-oa-fg tabular-nums">
            {page.length}
          </span>{" "}
          of{" "}
          <span className="font-medium text-oa-fg tabular-nums">
            {filtered.length}
          </span>{" "}
          articles · {market === "IN" ? "India" : "US"}
        </div>

        {page.length === 0 ? (
          <div className="rounded-[24px] border border-oa-border bg-oa-card px-6 py-16 text-center">
            <h3 className="text-[16px] font-medium text-oa-fg">
              No articles match your filters.
            </h3>
            <p className="text-[13px] text-oa-muted-fg mt-2">
              Try widening the timeframe or clearing sector / source picks.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {page.map((a) => {
              const meta = sentimentMeta(a.sentiment_label);
              return (
                <li key={a.id}>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-2xl border border-oa-border bg-oa-card p-5 hover:border-oa-fg/30 transition-colors [overflow-wrap:anywhere]"
                  >
                    <div className="flex items-center gap-2 text-[11px] mb-2 flex-wrap">
                      <span className="font-medium tracking-[0.05em] uppercase text-oa-primary">
                        {a.source_name || "Unknown source"}
                      </span>
                      <span className="text-oa-muted-fg/50">·</span>
                      <span className="text-oa-muted-fg">
                        {formatRelative(a.published_at)}
                      </span>
                      <span className="text-oa-muted-fg/50">·</span>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ background: meta.dot }}
                          aria-hidden
                        />
                        <span
                          className={`font-medium uppercase tracking-[0.08em] ${meta.tone}`}
                        >
                          {a.sentiment_label}
                        </span>
                      </span>
                    </div>

                    <h3 className="text-[16px] font-medium text-oa-fg leading-snug tracking-[-0.01em]">
                      {a.title}
                    </h3>

                    {a.summary && (
                      <p className="mt-2 text-[13px] text-oa-fg leading-[1.6]">
                        {a.summary}
                      </p>
                    )}

                    {(a.tickers.length > 0 || a.sector_tags.length > 0) && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {a.tickers.slice(0, 4).map((t) => (
                          <span
                            key={`t-${t}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-oa-border bg-oa-card pl-1 pr-2.5 py-1 text-[11px] font-medium text-oa-fg"
                          >
                            <StockLogo ticker={t} size={18} />
                            {t}
                          </span>
                        ))}
                        {a.sector_tags.slice(0, 3).map((s) => (
                          <span
                            key={`s-${s}`}
                            className="inline-flex items-center rounded-full bg-oa-bg px-2.5 py-1 text-[11px] font-medium text-oa-fg"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        {visible < filtered.length && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="self-center mt-2 px-5 py-2 rounded-full border border-oa-border bg-oa-card text-[13px] font-medium text-oa-fg hover:border-oa-fg/30 transition-colors"
          >
            Load {Math.min(PAGE_SIZE, filtered.length - visible)} more
          </button>
        )}
      </section>
    </div>
  );
}
