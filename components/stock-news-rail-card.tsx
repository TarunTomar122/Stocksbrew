"use client";

import Link from "next/link";
import { useState } from "react";

import { StockLogo } from "@/components/stock-logo";
import type { NewsArticle } from "@/lib/news";

const MAX_STORIES = 7;

function NewspaperIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M4 5h16v14H4z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
      <path d="M8 17h8" />
    </svg>
  );
}

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

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*[-–|]\s*[^-–|]+$/, "") // drop a trailing " - Source Name" suffix
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Some sources' summaries are just the headline restated - skip showing those. */
function isNearDuplicate(summary: string, title: string): boolean {
  const a = normalizeForCompare(summary);
  const b = normalizeForCompare(title);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.startsWith(b) || b.startsWith(a);
}

function displaySentiment(raw: string): string {
  const normalized = raw.toLowerCase();
  if (normalized === "bullish") return "Bullish";
  if (normalized === "bearish") return "Bearish";
  if (normalized === "mixed") return "Mixed";
  return "Neutral";
}

function sentimentTagClass(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized === "bullish") return "bg-[color-mix(in_srgb,var(--signal-bullish)_12%,transparent)] text-[var(--signal-bullish)]";
  if (normalized === "bearish") return "bg-[color-mix(in_srgb,var(--signal-bearish)_12%,transparent)] text-[var(--signal-bearish)]";
  if (normalized === "mixed") return "bg-[color-mix(in_srgb,var(--signal-neutral)_14%,transparent)] text-[var(--signal-neutral)]";
  return "bg-surface-container text-on-surface-variant";
}

function NewsSummaryModal({ article, onClose }: { article: NewsArticle; onClose: () => void }) {
  const time = formatArticleTime(article.published_at);
  const source = article.source_name?.trim() || "News";
  const rawSummary = article.summary?.trim();
  const summary = rawSummary && !isNearDuplicate(rawSummary, article.title) ? rawSummary : undefined;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-[#111827]/35 p-4 backdrop-blur-[1px] sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-2xl border border-outline-variant bg-surface px-6 py-6 shadow-[0_24px_48px_rgba(17,24,39,0.22)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.04em] ${sentimentTagClass(article.sentiment_label)}`}>
            {displaySentiment(article.sentiment_label)}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1 text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p className="mt-3 text-[12px] text-on-surface-variant">{[time, source].filter(Boolean).join(" · ")}</p>
        <h3 className="mt-2 text-[18px] font-medium leading-snug tracking-[-0.01em] text-on-surface">{article.title}</h3>

        {summary ? (
          <p className="mt-4 text-[14.5px] leading-relaxed text-on-surface-variant">{summary}</p>
        ) : null}

        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary"
        >
          <span className="group-hover:underline">Read the original source</span>
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
        </a>
      </div>
    </div>
  );
}

/** Editorial news stream for the stock page activity section. */
export function StockNewsRailCard({
  ticker,
  articles,
  days = 7,
  fullWidth = false,
}: {
  ticker: string;
  articles: NewsArticle[];
  days?: number;
  fullWidth?: boolean;
}) {
  const [selected, setSelected] = useState<NewsArticle | null>(null);
  const stories = articles.slice(0, MAX_STORIES);
  if (!stories.length) return null;

  return (
    <section className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-on-surface">
          <NewspaperIcon size={18} />
          <h3 className="text-[16px] font-medium">News</h3>
        </div>
        <span className="text-[12px] text-on-surface-variant">
          {stories.length} {stories.length === 1 ? "story" : "stories"} · {days}d · {ticker}
        </span>
      </div>

      <ul className={`mt-5 grid gap-x-7 gap-y-7 ${fullWidth ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2"}`}>
        {stories.map((article) => {
          const time = formatArticleTime(article.published_at);
          const source = article.source_name?.trim() || "News";
          return (
            <li key={article.id}>
              <button
                type="button"
                onClick={() => setSelected(article)}
                className="group block w-full text-left"
              >
                <span className="flex items-center gap-1.5 text-[12px] leading-snug text-on-surface-variant">
                  {article.tickers.length > 0 ? (
                    <span className="flex -space-x-1.5" aria-label={`Related stocks: ${article.tickers.slice(0, 3).join(", ")}`}>
                      {article.tickers.slice(0, 3).map((ticker) => (
                        <StockLogo
                          key={ticker}
                          ticker={ticker}
                          market={article.market}
                          size={16}
                          className="rounded-full border border-surface bg-surface"
                        />
                      ))}
                    </span>
                  ) : null}
                  <span>{[time, source].filter(Boolean).join(" · ")}</span>
                </span>
                <p className="mt-2 line-clamp-3 text-[15px] font-medium leading-[1.45] tracking-[-0.01em] text-on-surface group-hover:text-accent-terminal">
                  {article.title}
                </p>
                <span className={`mt-2.5 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.04em] ${sentimentTagClass(article.sentiment_label)}`}>
                  {displaySentiment(article.sentiment_label)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Link
        href="/news"
        className="group mt-7 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary"
      >
        <span className="group-hover:underline">All market news</span>
        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
      </Link>

      {selected ? <NewsSummaryModal article={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}
