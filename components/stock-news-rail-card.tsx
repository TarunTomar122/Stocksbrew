import Link from "next/link";

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
  const s = raw.toLowerCase();
  if (s === "bullish") return "Bullish";
  if (s === "bearish") return "Bearish";
  if (s === "neutral") return "Neutral";
  if (s === "mixed") return "Mixed";
  if (!raw.trim()) return "Neutral";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function sentimentTagClass(label: string): string {
  const s = label.toLowerCase();
  if (s === "bullish") return "text-[var(--signal-bullish)] tint-bull";
  if (s === "bearish") return "text-[var(--signal-bearish)] tint-bear";
  if (s === "mixed") return "text-[var(--signal-neutral)] tint-warn";
  return "text-on-surface-variant bg-surface-container";
}

/** Compact recent-news card for the stock page left rail. */
export function StockNewsRailCard({
  ticker,
  articles,
  days = 7,
}: {
  ticker: string;
  articles: NewsArticle[];
  days?: number;
}) {
  const stories = articles.slice(0, MAX_STORIES);
  if (!stories.length) return null;

  return (
    <section
      className="overflow-hidden rounded-2xl border border-outline-variant bg-surface"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div
        className="border-b px-4 py-3.5"
        style={{
          borderColor: "var(--outline-variant)",
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--accent-terminal) 10%, var(--surface)) 0%, color-mix(in srgb, var(--accent-terminal) 3%, var(--surface)) 55%, var(--surface) 100%)",
        }}
      >
        <div className="flex items-start gap-2.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-accent-terminal"
            style={{
              borderColor: "color-mix(in srgb, var(--accent-terminal) 22%, var(--outline-variant))",
              background: "color-mix(in srgb, var(--accent-terminal) 10%, var(--surface))",
              boxShadow: "inset 0 1px 0 color-mix(in srgb, white 40%, transparent)",
            }}
          >
            <NewspaperIcon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold leading-tight tracking-[-0.01em] text-on-surface">Recent News</p>
            <p className="mt-0.5 font-mono text-[10px] leading-snug text-on-surface-variant">
              <span className="font-semibold text-on-surface">{stories.length}</span>{" "}
              {stories.length === 1 ? "story" : "stories"} · last {days} days · {ticker}
            </p>
          </div>
        </div>
      </div>

      <div className="max-h-[19rem] overflow-y-auto overscroll-contain">
        <ul>
          {stories.map((article) => {
          const time = formatArticleTime(article.published_at);
          const source = article.source_name?.trim() || "News";
          return (
            <li
              key={article.id}
              className="border-b last:border-b-0"
              style={{ borderColor: "var(--outline-variant)" }}
            >
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block px-4 py-3.5 transition-colors hover:bg-surface-container-low"
              >
                <p className="line-clamp-3 text-[12.5px] font-semibold leading-snug tracking-[-0.01em] text-on-surface group-hover:text-accent-terminal">
                  {article.title}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={`inline-block rounded px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-[0.06em] ${sentimentTagClass(article.sentiment_label)}`}
                  >
                    {displaySentiment(article.sentiment_label)}
                  </span>
                  <span className="font-mono text-[9.5px] leading-snug text-on-surface-variant">
                    {[time, source].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </a>
            </li>
          );
        })}
        </ul>
      </div>

      <div
        className="border-t px-4 py-3"
        style={{
          borderColor: "var(--outline-variant)",
          background: "color-mix(in srgb, var(--accent-terminal) 3%, var(--surface))",
        }}
      >
        <Link
          href="/news"
          className="group inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold text-accent-terminal"
        >
          <NewspaperIcon size={12} />
          <span className="group-hover:underline">all market news</span>
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      </div>
    </section>
  );
}
