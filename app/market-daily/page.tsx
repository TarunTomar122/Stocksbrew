import type { Metadata } from "next";
import Link from "next/link";

import { listMarketDailyEditions } from "@/lib/market-daily";
import styles from "./market-daily.module.css";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Market Daily",
  description:
    "A source-linked US market letter explaining yesterday's market, the morning setup, and the stocks that moved differently from the crowd.",
  alternates: { canonical: "/market-daily" },
  keywords: ["US stock market", "market analysis", "premarket", "stock market today"],
  robots: { index: true, follow: true },
  openGraph: {
    title: "Market Daily · stocksbrew",
    description: "Yesterday, before the bell, and the few things that matter next.",
    url: "https://www.stocksbrew.online/market-daily",
    siteName: "stocksbrew",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "Market Daily · stocksbrew",
    description: "Yesterday, before the bell, and the few things that matter next.",
  },
};

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(`${value}T12:00:00-04:00`));
}

export default async function MarketDailyArchivePage() {
  const editions = await listMarketDailyEditions(40).catch(() => []);
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.masthead}>
          <span className={styles.edition}>US markets · before the bell</span>
          <div className={styles.brand}>
            Market Daily<span className={styles.brandDot}>.</span>
          </div>
          <span className={styles.dateline}>stocksbrew editorial desk</span>
        </header>

        <section className={styles.archiveHeader}>
          <h1 className={styles.archiveTitle}>Yesterday,<br />explained.</h1>
          <p className={styles.archiveIntro}>
            One argument about yesterday’s market, checked against the overnight
            news and morning data before the US open. Sources stay attached.
            Unknowns stay unknown.
          </p>
        </section>

        {editions.length ? (
          <section className={styles.archiveGrid} aria-label="Market Daily editions">
            {editions.map((edition, index) => (
              <Link
                href={`/market-daily/${edition.edition_date}`}
                className={styles.editionCard}
                key={edition.edition_date}
              >
                <span className={styles.cardDate}>
                  {index === 0 ? "Latest · " : ""}
                  {dateLabel(edition.edition_date)}
                </span>
                <h2 className={styles.cardHeadline}>{edition.headline}</h2>
                <p className={styles.cardDek}>{edition.dek}</p>
                <span className={styles.cardAction}>
                  Read the {edition.quality.word_count}-word edition →
                </span>
              </Link>
            ))}
          </section>
        ) : (
          <p className={styles.empty}>The desk is gathering today’s evidence.</p>
        )}
      </div>
    </main>
  );
}
