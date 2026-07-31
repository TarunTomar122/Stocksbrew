import Link from "next/link";

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
  const stories = articles.slice(0, MAX_STORIES);
  if (!stories.length) return null;

  return (
    <section className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-on-surface">
          <NewspaperIcon size={18} />
          <h3 className="text-[15px] font-bold tracking-[-0.01em]">News</h3>
        </div>
        <span className="font-mono text-[9.5px] text-on-surface-variant">
          {stories.length} {stories.length === 1 ? "story" : "stories"} · {days}d · {ticker}
        </span>
      </div>

      <ul className={`mt-5 grid gap-x-7 gap-y-7 ${fullWidth ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2"}`}>
        {stories.map((article) => {
          const time = formatArticleTime(article.published_at);
          const source = article.source_name?.trim() || "News";
          return (
            <li key={article.id}>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <span className="flex items-center gap-1.5 font-mono text-[9.5px] leading-snug text-on-surface-variant">
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
                <p className="mt-2 line-clamp-3 text-[13px] font-semibold leading-[1.42] tracking-[-0.01em] text-on-surface group-hover:text-accent-terminal">
                  {article.title}
                </p>
                <span className={`mt-2 inline-flex rounded-full px-2 py-1 font-mono text-[8.5px] font-bold uppercase tracking-[0.06em] ${sentimentTagClass(article.sentiment_label)}`}>
                  {displaySentiment(article.sentiment_label)}
                </span>
              </a>
            </li>
          );
        })}
      </ul>

      <Link
        href="/news"
        className="group mt-7 inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold text-accent-terminal"
      >
        <span className="group-hover:underline">all market news</span>
        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
      </Link>
    </section>
  );
}
