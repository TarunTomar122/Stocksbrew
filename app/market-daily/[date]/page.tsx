import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { MarketDailyEmbed } from "@/components/market-daily-embed";
import {
  getMarketDailyEdition,
  listMarketDailyEditions,
  type MarketDailyEdition,
  type MarketDailyMove,
} from "@/lib/market-daily";
import styles from "../market-daily.module.css";

export const revalidate = 300;

type Props = {
  params: Promise<{ date: string }>;
};

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(`${value}T12:00:00-04:00`));
}

function timeLabel(value: string): string {
  if (!value) return "as captured";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "as captured";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/New_York",
  }).format(date);
}

function moveClass(move: MarketDailyMove): string {
  const value = Number(move.change_pct || 0);
  if (value > 0) return styles.positive;
  if (value < 0) return styles.negative;
  return styles.flat;
}

function moveValue(move: MarketDailyMove): string {
  const value = Number(move.change_pct);
  if (!Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function SourceLinks({
  ids,
  edition,
}: {
  ids: string[];
  edition: MarketDailyEdition;
}) {
  const seen = new Set<string>();
  const sources = ids
    .map((id) => edition.sources.find((source) => source.id === id))
    .filter((source): source is NonNullable<typeof source> => Boolean(source))
    .filter((source) => {
      if (seen.has(source.id)) return false;
      seen.add(source.id);
      return true;
    });
  if (!sources.length) return null;
  return (
    <div className={styles.sourceLine}>
      <span>Sources</span>
      {sources.map((source) => (
        <a
          className={styles.sourceLink}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          key={source.id}
        >
          {source.publisher || source.title}
        </a>
      ))}
    </div>
  );
}

const componentPattern =
  /(\{\{(?:INDEX_CHART|SECTOR_CHART|MARKET_PULSE|PREMARKET_BOARD|MOVER_CARDS|ANOMALY_RAIL)\}\})/g;
const articleMarkers = new Set([
  "{{INDEX_CHART}}",
  "{{SECTOR_CHART}}",
  "{{MARKET_PULSE}}",
  "{{PREMARKET_BOARD}}",
  "{{MOVER_CARDS}}",
  "{{ANOMALY_RAIL}}",
]);

type ArticleMarker =
  | "{{INDEX_CHART}}"
  | "{{SECTOR_CHART}}"
  | "{{MARKET_PULSE}}"
  | "{{PREMARKET_BOARD}}"
  | "{{MOVER_CARDS}}"
  | "{{ANOMALY_RAIL}}";

function ArticleBody({ edition }: { edition: MarketDailyEdition }) {
  const parts = edition.article_markdown.split(componentPattern).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (articleMarkers.has(part)) {
          return (
            <MarketDailyEmbed
              marker={part as ArticleMarker}
              edition={edition}
              key={`${part}-${index}`}
            />
          );
        }
        return (
          <div className={styles.articleProse} key={index}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {part}
            </ReactMarkdown>
          </div>
        );
      })}
    </>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params;
  if (!validDate(date)) return { title: "Market Daily" };
  const edition = await getMarketDailyEdition(date).catch(() => null);
  if (!edition) return { title: "Market Daily" };
  const tickers = edition.anomalies.unusual.slice(0, 5).map((move) => move.ticker);
  const keywords = [
    "US stock market",
    "market analysis",
    "premarket",
    "stock market today",
    ...tickers,
  ];
  const url = `https://www.stocksbrew.online/market-daily/${date}`;
  return {
    title: edition.headline,
    description: edition.dek,
    authors: [{ name: "Stocksbrew research desk", url: "https://www.stocksbrew.online" }],
    publisher: "stocksbrew",
    category: "Markets",
    keywords,
    robots: { index: true, follow: true },
    alternates: { canonical: `/market-daily/${date}` },
    openGraph: {
      type: "article",
      title: edition.headline,
      description: edition.dek,
      url,
      siteName: "stocksbrew",
      locale: "en_US",
      publishedTime: edition.published_at,
      modifiedTime: edition.updated_at,
      authors: ["Stocksbrew research desk"],
      section: "Markets",
      tags: keywords,
    },
    twitter: {
      card: "summary",
      title: edition.headline,
      description: edition.dek,
    },
  };
}

export default async function MarketDailyEditionPage({ params }: Props) {
  const { date } = await params;
  if (!validDate(date)) notFound();
  const edition = await getMarketDailyEdition(date).catch(() => null);
  if (!edition) notFound();

  const editions = await listMarketDailyEditions(90).catch(() => []);
  const editionIndex = editions.findIndex((item) => item.edition_date === date);
  const newerEdition = editionIndex > 0 ? editions[editionIndex - 1] : null;
  const olderEdition = editionIndex >= 0 ? editions[editionIndex + 1] || null : null;
  const closeRows = edition.tape.markets.filter((row) => row.group === "index").slice(0, 3);
  const futuresRows = edition.premarket.futures.slice(0, 3);
  const url = `https://www.stocksbrew.online/market-daily/${edition.edition_date}`;
  const citedSources = edition.source_ids
    .map((id) => edition.sources.find((source) => source.id === id)?.url)
    .filter((source): source is string => Boolean(source));
  const anomalyTickers = edition.anomalies.unusual.slice(0, 5).map((move) => move.ticker);
  const articleSchema = {
    "@type": "NewsArticle",
    url,
    headline: edition.headline,
    description: edition.dek,
    image: [edition.cover_image?.url || "https://www.stocksbrew.online/api/og"],
    datePublished: edition.published_at,
    dateModified: edition.updated_at,
    inLanguage: "en-US",
    articleSection: "Markets",
    wordCount: edition.quality.word_count,
    keywords: ["US stock market", "market analysis", "premarket", ...anomalyTickers],
    citation: citedSources,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    isAccessibleForFree: true,
    isPartOf: {
      "@type": "CreativeWorkSeries",
      name: "Market Daily",
      url: "https://www.stocksbrew.online/market-daily",
    },
    about: [
      { "@type": "Thing", name: "United States stock market" },
      ...anomalyTickers.map((ticker) => ({
        "@type": "Corporation",
        name: ticker,
        tickerSymbol: ticker,
      })),
    ],
    author: {
      "@type": "Organization",
      name: "Stocksbrew research desk",
      url: "https://www.stocksbrew.online/editorial-policy",
    },
    publisher: {
      "@type": "Organization",
      "@id": "https://www.stocksbrew.online/#organization",
      name: "stocksbrew",
      url: "https://www.stocksbrew.online",
    },
  };
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      articleSchema,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://www.stocksbrew.online" },
          { "@type": "ListItem", position: 2, name: "Market Daily", item: "https://www.stocksbrew.online/market-daily" },
          { "@type": "ListItem", position: 3, name: edition.headline, item: url },
        ],
      },
    ],
  };

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <div className={styles.shell}>
        <header className={styles.masthead}>
          <span className={styles.edition}>US markets</span>
          <Link href="/market-daily" className={styles.brand}>
            Market Daily
          </Link>
          <span className={styles.dateline}>{dateLabel(edition.edition_date)}</span>
        </header>

        <div className={styles.strap}>
          <span>Stocksbrew market view</span>
          <span className={styles.status}>Sources checked · figures verified</span>
        </div>

        <header className={styles.headlineBlock}>
          <div className={styles.rubric}>Market daily</div>
          <h1 className={styles.headline}>{edition.headline}</h1>
          <p className={styles.dek}>{edition.dek}</p>
          <div className={styles.byline}>
            <span>Premarket checked {timeLabel(edition.premarket.as_of)}</span>
          </div>
        </header>

        <div className={styles.articleGrid}>
          <aside className={styles.sidebar} aria-label="Edition data">
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>
                Yesterday
                <span className={styles.asOf}>{edition.previous_session_date}</span>
              </h2>
              {closeRows.map((move) => (
                <div className={styles.tapeRow} key={move.symbol}>
                  <span className={styles.tapeLabel}>{move.label}</span>
                  <strong className={moveClass(move)}>{moveValue(move)}</strong>
                </div>
              ))}
              <div className={styles.tapeRow}>
                <span className={styles.tapeLabel}>Sectors up / down</span>
                <strong>
                  {edition.tape.sector_breadth.positive} / {edition.tape.sector_breadth.negative}
                </strong>
              </div>
            </section>

            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>
                Before the bell
                <span className={styles.asOf}>{timeLabel(edition.premarket.as_of)}</span>
              </h2>
              {futuresRows.map((move) => (
                <div className={styles.tapeRow} key={move.symbol}>
                  <span className={styles.tapeLabel}>{move.label}</span>
                  <strong className={moveClass(move)}>{moveValue(move)}</strong>
                </div>
              ))}
            </section>
          </aside>

          <article className={styles.body}>
            <ArticleBody edition={edition} />
            <SourceLinks ids={edition.source_ids} edition={edition} />

            <div className={styles.method}>
              Reporting draws on the linked sources and Stocksbrew’s timestamped market data.
              Figures and attribution are checked before publication. This is general market
              commentary, not investment advice.{" "}
              <Link href="/editorial-policy">Read our editorial standards.</Link>
            </div>

            <nav className={styles.editionNav} aria-label="Browse Market Daily editions">
              {olderEdition ? (
                <Link
                  href={`/market-daily/${olderEdition.edition_date}`}
                  className={styles.editionNavLink}
                >
                  <span>Previous edition · {dateLabel(olderEdition.edition_date)}</span>
                  <strong>{olderEdition.headline}</strong>
                </Link>
              ) : (
                <span />
              )}
              <Link href="/market-daily" className={styles.archiveLink}>
                All editions
              </Link>
              {newerEdition ? (
                <Link
                  href={`/market-daily/${newerEdition.edition_date}`}
                  className={`${styles.editionNavLink} ${styles.editionNavNext}`}
                >
                  <span>Next edition · {dateLabel(newerEdition.edition_date)}</span>
                  <strong>{newerEdition.headline}</strong>
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </article>
        </div>
      </div>
    </main>
  );
}
