import type { Metadata } from "next";

import { AppPage, PageHead, fmtStampET } from "@/components/oa/kit";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { CompanyFeed } from "@/components/wire/company-feed";
import { TalkedAbout } from "@/components/wire/news-read";
import { TickerStrip, WireFilterBar, WireSearch, WireStream } from "@/components/wire/wire-view";
import { getSessionUser } from "@/lib/auth-server";
import { getTrackedStocks } from "@/lib/watchlist";
import { loadWire, modelLabel } from "@/lib/wire";
import { COMPANY_PAGE, groupByCompany, labelFor, withoutShown } from "@/lib/wire-companies";
import { caseWireHeadlines } from "@/lib/wire-casing";
import { withHeadlineTones } from "@/lib/wire-headline-tone";
import { countTones, readTheWire, storiesBetween } from "@/lib/wire-read";
import {
  WIRE_TOPICS,
  filterWire,
  groupByDay,
  WIRE_MAX_ROWS,
  WIRE_PAGE_SIZE,
  parseWireFilters,
  themeKey,
  type WireTopic,
} from "@/lib/wire-shared";
import { ogImage } from "@/lib/og/url";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Which US companies are in the news today, how their stocks are moving and the headlines worth reading. Filter by topic or your own stocks.";

export function generateMetadata(): Metadata {
  const shareImage = ogImage(["page", "news"], "US stock news today, read by company", { daily: true });
  return {
    title: "US Stock Market News Today",
    description: DESCRIPTION,
    keywords: ["US stock market news", "stock news today", "stock market headlines", "company news", "earnings news"],
    alternates: { canonical: "/news" },
    openGraph: {
      title: "US Stock Market News Today · stocksbrew",
      description: DESCRIPTION,
      url: "https://www.stocksbrew.online/news",
      images: [shareImage],
    },
    twitter: { card: "summary_large_image", title: "US Stock Market News Today · stocksbrew", description: DESCRIPTION, images: [shareImage] },
  };
}

type SearchParams = Record<string, string | string[] | undefined>;

/** Any filter that narrows the wire below "everything today". */
function hasNarrowing(filters: { topic: unknown; mine: boolean; q: string }): boolean {
  return Boolean(filters.topic || filters.mine || filters.q);
}

export default async function NewsPage({ searchParams }: { searchParams?: SearchParams }) {
  const filters = parseWireFilters(searchParams);
  const now = Date.now();

  const session = await getSessionUser().catch(() => null);
  const [loaded, tracked] = await Promise.all([
    loadWire({ ticker: filters.ticker, now }),
    session ? getTrackedStocks(session.uid).catch(() => []) : Promise.resolve([] as string[]),
  ]);
  // Read by company: the last 24 hours, anchored on the newest headline so a quiet weekend still shows something.
  // Never later than now, so one headline stamped in the future cannot push the window past real news.
  const anchor = loaded.freshness.newestAt ? Math.min(now, Date.parse(loaded.freshness.newestAt)) : now;
  const since = anchor - 24 * 3_600_000;
  // Every headline the page can show in sentence case, before anything reads or groups them (owner rule 8): the
  // scraped capitals the shared casing cannot judge alone are lowered where the day's other writing has the word in
  // lower case (lib/wire-casing.ts). Only the last two days' stories, or a filtered stock's or theme's, reach the page.
  const names = Object.fromEntries(Object.entries(loaded.quotes).map(([ticker, quote]) => [ticker, quote.name]));
  const wire = {
    ...loaded,
    items: caseWireHeadlines(loaded.items, names, {
      // The same wire gives the same words: its newest time, size, first and last story, and the stock it was read for.
      key: [loaded.freshness.newestAt ?? "", loaded.items.length, loaded.items[0]?.id ?? "", loaded.items.at(-1)?.id ?? "", filters.ticker ?? ""].join("|"),
      shown: (item) =>
        (filters.ticker ? item.tickers.includes(filters.ticker) : false) ||
        (filters.theme ? themeKey(loaded.labels[item.id]?.theme ?? "") === themeKey(filters.theme) : false) ||
        Date.parse(item.publishedAt) >= anchor - 48 * 3_600_000,
    }),
  };
  // Tracked ids look like "US_NVDA".
  const mine = new Set(tracked.map((id) => id.replace(/^[A-Z]{2}_/, "").toUpperCase()));
  const mineSet = session && mine.size > 0 ? mine : null;
  // "My stocks" in a shared link means nothing to someone signed out, so it is dropped rather than showing an empty wire.
  const effective = { ...filters, mine: filters.mine && mineSet !== null };

  const themeOf = Object.fromEntries(Object.entries(wire.labels).map(([id, label]) => [id, label.theme]));
  const matched = filterWire(wire.items, effective, mineSet, themeOf);
  const visible = matched.slice(0, effective.limit);
  const days = groupByDay(visible, now);

  // Chip counts answer "how many would I see", so they ignore the topic filter itself.
  const withoutTopic = filterWire(wire.items, { ...effective, topic: null }, mineSet, themeOf);
  const topicCounts = Object.fromEntries(
    WIRE_TOPICS.map((topic) => [topic.id, withoutTopic.filter((item) => item.topics.includes(topic.id)).length]),
  ) as Record<WireTopic, number>;
  const mineCount = mineSet ? filterWire(wire.items, { ...effective, mine: true }, mineSet, themeOf).length : null;

  // The model labels, plus a tone from the headline's own words for the last two days' stories it has not read, so
  // a stock's news can be said to lean even when the labeller is behind (lib/wire-headline-tone.ts; kept apart).
  const labels = withHeadlineTones(wire.items, wire.labels, { sinceMs: anchor - 48 * 3_600_000, names });
  // A ticker or a theme reads as one time-ordered stream; everything else is read by stock.
  const streamView = Boolean(effective.ticker || effective.theme);
  const grouped = streamView ? [] : groupByCompany(matched, { sinceMs: since, quotes: wire.quotes, mine: mineSet, labels });
  // The most talked about stocks are about the whole market, so they only lead the unfiltered wire.
  const reading =
    streamView || hasNarrowing(effective)
      ? null
      : readTheWire(
          {
            items: wire.items,
            quotes: wire.quotes,
            labels,
            newestAt: wire.freshness.newestAt,
            labelledBy: modelLabel(wire.labelsMeta.model),
            labelledAt: wire.labelsMeta.updatedAt,
          },
          { nowMs: now, filters: effective, buzzLimit: 14, themeLimit: 5 },
        );
  // "My stocks" keeps stories that name a followed company; a roundup naming others must not put them under "Your companies".
  // Under "Most talked about", the feed goes on with the next companies rather than starting the same tickers over
  // (judges, ship 53): a stock ranked above is one tap away from its own stories. Followed stocks stay, so "your
  // companies" never loses one; their top story already listed above is left out of their card.
  const shownAbove = reading?.buzz.flatMap((row) => (row.lead ? [row.lead] : [])) ?? [];
  const rankedAbove = new Set(reading?.buzz.map((row) => row.ticker) ?? []);
  const candidates = effective.mine ? grouped.filter((group) => group.mine) : grouped;
  const next = candidates.filter((group) => group.mine || !rankedAbove.has(group.ticker));
  // On a quiet day every company may already be ranked above; the feed then keeps them rather than saying none.
  const companies = withoutShown(next.length ? next : candidates, shownAbove);
  // Each "more" step shows another page of companies; the URL's row limit caps how many steps there are.
  const step = Math.max(1, Math.round(effective.limit / WIRE_PAGE_SIZE));
  const shownCompanies = COMPANY_PAGE * step;
  const canShowMore = effective.limit < WIRE_MAX_ROWS;
  // One stock's lean over the same last day the rest of the page reads, every story counted.
  const tickerDay = effective.ticker ? storiesBetween(wire.items, labels, since, anchor + 1) : [];

  return (
    <AppPage>
      <MarketingSchema
        path="/news"
        name="US Stock Market News Today"
        description={DESCRIPTION}
        breadcrumbLabel="US Stock Market News"
      />
      <PageHead
        title="News"
        inline
        actions={<WireSearch filters={effective} />}
      />

      {wire.origin !== "none" && wire.freshness.state === "stale" ? (
        <p className="oa-surface mb-4 border border-oa-border bg-oa-bg px-4 py-3 text-[14px] leading-5 text-oa-fg">
          This feed is paused. The newest headline is from {fmtStampET(wire.freshness.newestAt)}.
        </p>
      ) : null}

      {/* Stocks first (owner rule 7): the most talked about stocks, each with its top story, then every company's
          headlines in its own card below. No separate list of stories by theme: it showed the same headlines again,
          away from their stocks. */}
      {reading?.buzz.length ? <TalkedAbout rows={reading.buzz} filters={effective} wide className="mb-6" /> : null}

      <WireFilterBar filters={effective} topicCounts={topicCounts} mineCount={mineCount} signedIn={Boolean(session)} />

      {effective.theme && !effective.ticker ? (
        <h2 className="mb-2 text-[15px] font-semibold leading-[22px] text-oa-fg">
          {effective.theme} <span className="oa-mono tabular-nums text-[13px] font-normal text-oa-muted-fg">· {matched.length} stories</span>
        </h2>
      ) : null}

      {effective.ticker ? (
        <TickerStrip
          ticker={effective.ticker}
          quote={wire.quotes[effective.ticker]}
          count={wire.items.length}
          tones={countTones(tickerDay, labels, (item) => Boolean(labelFor(labels, item, effective.ticker ?? "")))}
          toneStories={tickerDay.filter((item) => labels[item.id]?.scope !== "other").length}
          filters={effective}
        />
      ) : null}

      {streamView ? (
        <WireStream days={days} quotes={wire.quotes} filters={effective} shown={visible.length} total={matched.length} />
      ) : (
        <CompanyFeed groups={companies} filters={effective} shown={shownCompanies} canShowMore={canShowMore} signedIn={Boolean(session)} />
      )}
    </AppPage>
  );
}
