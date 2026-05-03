"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { NewsArticle } from "@/lib/news";

type SentimentFilter = "all" | "bullish" | "bearish" | "neutral";

const PLACEHOLDER_SUMMARY =
  "Open the article for the full story — summary not available for this source.";

function formatArticleTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sentimentMatches(label: string, filter: SentimentFilter): boolean {
  const s = label.toLowerCase();
  if (filter === "all") return true;
  if (filter === "bullish") return s === "bullish";
  if (filter === "bearish") return s === "bearish";
  return s === "neutral" || s === "mixed";
}

function displaySentiment(raw: string): string {
  const s = raw.toLowerCase();
  if (s === "bullish") return "Bullish";
  if (s === "bearish") return "Bearish";
  if (s === "neutral") return "Neutral";
  if (s === "mixed") return "Mixed";
  if (!raw.trim()) return "Neutral";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** Muted tag — readable but not loud */
function sentimentTagStyles(label: string): string {
  const s = label.toLowerCase();
  if (s === "bullish") return "text-[#4a6356] bg-[#f1f5f3]";
  if (s === "bearish") return "text-[#8b5349] bg-[#f7f2f1]";
  if (s === "mixed") return "text-[#736848] bg-[#f7f5ef]";
  return "text-[#737373] bg-[#f3f3f3]";
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function SymbolPicker({
  value,
  onChange,
  tickers,
}: {
  value: string;
  onChange: (v: string) => void;
  tickers: string[];
}) {
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerLabel = value.trim() ? value.toUpperCase() : "All";

  const options: { value: string; label: string }[] = [
    { value: "", label: "All" },
    ...tickers.map((t) => ({ value: t, label: t.toUpperCase() })),
  ];

  return (
    <div ref={rootRef} className="relative min-w-[152px]">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        id={triggerId}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-[#e5e5e5] bg-white px-3 text-left text-[13px] font-medium text-[#0a0a0a] outline-none transition-colors hover:border-[#d4d4d4] focus-visible:border-[#a3a3a3] focus-visible:ring-2 focus-visible:ring-[#111111]/10"
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown
          className={`shrink-0 text-[#525252] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-labelledby={triggerId}
          className="absolute left-0 top-[calc(100%+6px)] z-[80] w-full max-h-[min(260px,45vh)] overflow-auto rounded-xl border border-[#ebebeb] bg-white py-1 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.04]"
        >
          {options.map((opt) => {
            const selected =
              opt.value === "" ? value === "" : opt.value.toUpperCase() === value.toUpperCase();
            return (
              <button
                key={opt.value || "__all"}
                type="button"
                role="option"
                aria-selected={selected}
                className={`flex w-full min-w-[148px] items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors ${
                  selected
                    ? "bg-[#f4f4f4] font-semibold text-[#0a0a0a]"
                    : "text-[#404040] hover:bg-[#fafafa]"
                }`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {selected ? (
                  <span className="inline-block w-3 shrink-0 text-[11px] text-[#0a0a0a]">✓</span>
                ) : (
                  <span className="inline-block w-3 shrink-0" aria-hidden />
                )}
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Round-robin into N columns for a masonry-like spread (short + tall stories interleaved). */
function splitIntoColumns<T>(items: T[], columnCount: number): T[][] {
  const cols: T[][] = Array.from({ length: columnCount }, () => []);
  items.forEach((item, i) => {
    cols[i % columnCount]!.push(item);
  });
  return cols;
}

type ArticleCardProps = {
  article: NewsArticle;
  radarSet: Set<string>;
  tickerMetaMode: "radar_overlap" | "article_tickers";
  compact?: boolean;
};

function ArticleCard({ article, radarSet, tickerMetaMode, compact }: ArticleCardProps) {
  const overlap =
    tickerMetaMode === "radar_overlap"
      ? article.tickers.filter((t) => radarSet.has(String(t).toUpperCase()))
      : [];
  const mentionLine =
    tickerMetaMode === "radar_overlap"
      ? overlap.length > 0
        ? overlap.slice(0, 4).join(" · ")
        : null
      : article.tickers.length > 0
        ? article.tickers.slice(0, 4).join(" · ")
        : null;

  const time = formatArticleTime(article.published_at);
  const rawSummary = article.summary?.trim() ?? "";
  const showSummary =
    rawSummary.length > 0 &&
    rawSummary !== PLACEHOLDER_SUMMARY &&
    rawSummary.length > 24;

  const metaParts = [time, article.source_name || "News", mentionLine].filter(Boolean);

  return (
    <article className="last:[&>a]:border-b-0">
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block w-full border-b border-dashed border-[#e5e7eb] px-1.5 py-5 outline-none transition-colors hover:bg-[#f5f5f5] focus-visible:bg-[#fafafa] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#111111]/10 sm:px-2"
      >
        <h3
          className={`font-bold tracking-[-0.02em] text-[#0a0a0a] leading-snug group-hover:text-[#0052ff] transition-colors ${
            compact ? "text-[14px]" : "text-[15px] sm:text-[16px]"
          }`}
        >
          {article.title}
        </h3>
        <span
          className={`mt-1.5 inline-block rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.07em] ${sentimentTagStyles(article.sentiment_label)}`}
        >
          {displaySentiment(article.sentiment_label)}
        </span>
        {showSummary && (
          <p
            className={`mt-2 text-[13px] leading-relaxed text-[#525252] ${
              compact ? "line-clamp-2" : "line-clamp-4"
            }`}
          >
            {rawSummary}
          </p>
        )}
        <p className="mt-3 text-[11px] leading-normal text-[#a3a3a3]">{metaParts.join(" — ")}</p>
      </a>
    </article>
  );
}

export type RadarStyleNewsFeedVariant = "radar" | "market";

export type RadarStyleNewsFeedProps =
  | {
      variant: "radar";
      articles: NewsArticle[];
      radarTickers: string[];
    }
  | {
      variant: "market";
      articles: NewsArticle[];
      market: "US" | "IN";
    };

const RADAR_COPY = {
  title: "Radar news",
  subtitle:
    "Stories mentioning your tracked names — scan fast like a wire, open anything that matters.",
} as const;

function marketSubtitle(market: "US" | "IN"): string {
  const region = market === "IN" ? "India" : "US";
  return `Latest headlines across the ${region} universe — scan fast like a wire, open anything that matters.`;
}

export function RadarStyleNewsFeed(props: RadarStyleNewsFeedProps) {
  const { articles, variant } = props;
  const [tickerFilter, setTickerFilter] = useState("");
  const [sentiment, setSentiment] = useState<SentimentFilter>("all");

  const radarTickers = variant === "radar" ? props.radarTickers : [];
  const radarSet = useMemo(
    () => new Set(radarTickers.map((t) => String(t).toUpperCase())),
    [radarTickers],
  );

  const showSymbolPicker = variant === "radar";
  const tickerMetaMode: ArticleCardProps["tickerMetaMode"] =
    variant === "radar" ? "radar_overlap" : "article_tickers";

  const articlesForToneCounts = useMemo(() => {
    if (!showSymbolPicker || !tickerFilter.trim()) return articles;
    const want = tickerFilter.toUpperCase();
    return articles.filter((a) => a.tickers.some((t) => String(t).toUpperCase() === want));
  }, [articles, showSymbolPicker, tickerFilter]);

  const toneCounts = useMemo(() => {
    let bullish = 0;
    let bearish = 0;
    let neutral = 0;
    for (const a of articlesForToneCounts) {
      const s = String(a.sentiment_label ?? "").toLowerCase();
      if (s === "bullish") bullish++;
      else if (s === "bearish") bearish++;
      else if (s === "neutral" || s === "mixed") neutral++;
    }
    return {
      all: articlesForToneCounts.length,
      bullish,
      bearish,
      neutral,
    };
  }, [articlesForToneCounts]);

  const title = variant === "radar" ? RADAR_COPY.title : "Market news";
  const subtitle =
    variant === "radar" ? RADAR_COPY.subtitle : marketSubtitle(props.market);

  const HeadingTag = variant === "market" ? "h1" : "h2";

  const filtered = useMemo(() => {
    return articles.filter((a) => {
      if (showSymbolPicker && tickerFilter) {
        const want = tickerFilter.toUpperCase();
        if (!a.tickers.some((t) => String(t).toUpperCase() === want)) return false;
      }
      return sentimentMatches(a.sentiment_label, sentiment);
    });
  }, [articles, tickerFilter, sentiment, showSymbolPicker]);

  const columnCount =
    filtered.length <= 4 ? 1 : filtered.length <= 14 ? 2 : 3;

  const columns = useMemo(
    () => splitIntoColumns(filtered, columnCount),
    [filtered, columnCount],
  );

  const gridClass =
    columnCount === 1
      ? "grid grid-cols-1"
      : columnCount === 2
        ? "grid grid-cols-1 md:grid-cols-2"
        : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3";

  const sentimentPills: { key: SentimentFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "bullish", label: "Bullish" },
    { key: "bearish", label: "Bearish" },
    { key: "neutral", label: "Neutral" },
  ];

  function toneCountFor(key: SentimentFilter): number {
    if (key === "all") return toneCounts.all;
    if (key === "bullish") return toneCounts.bullish;
    if (key === "bearish") return toneCounts.bearish;
    return toneCounts.neutral;
  }

  const emptyBody =
    variant === "radar" ? (
      <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-[#737373]">
        <p>
          Nothing matched your Radar in the latest news run yet — try again after the pipeline
          refreshes, or open the full market feed.
        </p>
        <Link href="/news" className="w-fit font-semibold text-[#0052ff] hover:underline">
          Market news →
        </Link>
      </div>
    ) : (
      <p className="text-[13px] leading-relaxed text-[#737373]">
        No articles are available for this market in the latest news run yet — check back after the
        pipeline refreshes.
      </p>
    );

  const filteredEmptyHint =
    variant === "radar"
      ? "No stories match these filters — try another symbol or tone."
      : "No stories match this tone — try All or another tone.";

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-[#e5e7eb] bg-white p-3 md:p-5">
      <div className="flex shrink-0 flex-col gap-4 border-b border-[#ebebeb] pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <HeadingTag className="text-[18px] font-bold tracking-[-0.03em] text-[#0a0a0a] md:text-[20px]">
            {title}
          </HeadingTag>
          <p className="max-w-xl text-[13px] leading-relaxed text-[#737373]">{subtitle}</p>
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#b5b5b5]">
            {articles.length === 0
              ? "—"
              : filtered.length === articles.length
                ? `${articles.length} stories`
                : `${filtered.length} of ${articles.length} stories`}
          </span>
        </div>

        {articles.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            {showSymbolPicker ? (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#b5b5b5]">
                  Symbol
                </span>
                <SymbolPicker
                  value={tickerFilter}
                  onChange={setTickerFilter}
                  tickers={radarTickers}
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#b5b5b5]">
                Tone
              </span>
              <div className="flex flex-wrap gap-1">
                {sentimentPills.map(({ key, label }) => {
                  const active = sentiment === key;
                  const count = toneCountFor(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSentiment(key)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-wide transition-colors ${
                        active
                          ? "bg-[#0a0a0a] text-white"
                          : "bg-[#f5f5f5] text-[#737373] hover:bg-[#ebebeb] hover:text-[#0a0a0a]"
                      }`}
                    >
                      <span className="inline-flex items-baseline gap-1">
                        <span>{label}</span>
                        <span
                          className={
                            active
                              ? "font-medium tabular-nums text-white/65"
                              : "font-medium tabular-nums text-[#b0b0b0]"
                          }
                        >
                          · {count}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {articles.length === 0 ? (
        emptyBody
      ) : filtered.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-[#737373]">{filteredEmptyHint}</p>
      ) : (
        <div className={`w-full ${gridClass} gap-x-8 gap-y-0 lg:gap-x-10`}>
          {columns.map((col, ci) => (
            <div key={ci} className="flex flex-col">
              {col.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  radarSet={radarSet}
                  tickerMetaMode={tickerMetaMode}
                  compact={filtered.length > 18}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
