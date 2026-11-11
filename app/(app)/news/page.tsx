import type { Metadata } from "next";

import { AppPage, PageHead, fmtStampET } from "@/components/oa/kit";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { TheRead } from "@/components/oa/insight";
import { CompanyFeed } from "@/components/wire/company-feed";
import { TalkedAbout, ThemesPanel } from "@/components/wire/news-read";
import { TickerStrip, WireFilterBar, WireSearch, WireStream } from "@/components/wire/wire-view";
import { getSessionUser } from "@/lib/auth-server";
import { getTrackedStocks } from "@/lib/watchlist";
import { loadWire, modelLabel } from "@/lib/wire";
import { COMPANY_PAGE, groupByCompany } from "@/lib/wire-companies";
import { countTones, readTheWire, themesBesideRead } from "@/lib/wire-read";
import {
  WIRE_TOPICS,
  filterWire,
  groupByDay,
  WIRE_MAX_ROWS,
  WIRE_PAGE_SIZE,
  parseWireFilters,
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
  const [wire, tracked] = await Promise.all([
    loadWire({ ticker: filters.ticker, now }),
    session ? getTrackedStocks(session.uid).catch(() => []) : Promise.resolve([] as string[]),
  ]);
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

  // Read by company: the last 24 hours, anchored on the newest headline so a quiet weekend still shows something.
  // Never later than now, so one headline stamped in the future cannot push the window past real news.
  const anchor = wire.freshness.newestAt ? Math.min(now, Date.parse(wire.freshness.newestAt)) : now;
  const since = anchor - 24 * 3_600_000;
  // A ticker or a theme reads as one time-ordered stream; everything else is read by stock.
  const streamView = Boolean(effective.ticker || effective.theme);
  const grouped = streamView ? [] : groupByCompany(matched, { sinceMs: since, quotes: wire.quotes, mine: mineSet, labels: wire.labels });
  // "My stocks" keeps stories that name a followed company; a roundup naming others must not put them under "Your companies".
  const companies = effective.mine ? grouped.filter((group) => group.mine) : grouped;
  // The read is about the whole market, so it only leads the unfiltered wire.
  const reading =
    streamView || hasNarrowing(effective)
      ? null
      : readTheWire(
          {
            items: wire.items,
            quotes: wire.quotes,
            labels: wire.labels,
            newestAt: wire.freshness.newestAt,
            labelledBy: modelLabel(wire.labelsMeta.model),
            labelledAt: wire.labelsMeta.updatedAt,
          },
          { nowMs: now, filters: effective, buzzLimit: 14, themeLimit: 5 },
        );
  // The stories beside the read, without one that is only about the stock the read already leads with.
  const themes = reading ? themesBesideRead(reading.themes, reading.read) : [];
  // Each "more" step shows another page of companies; the URL's row limit caps how many steps there are.
  const step = Math.max(1, Math.round(effective.limit / WIRE_PAGE_SIZE));
  const shownCompanies = COMPANY_PAGE * step;
  const canShowMore = effective.limit < WIRE_MAX_ROWS;

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
        lede="Which companies are in the news today, how they are moving, and the headlines worth reading."
        inline
        className="[&_.oa-head-lede]:hidden"
        actions={<WireSearch filters={effective} />}
      />

      {wire.origin !== "none" && wire.freshness.state === "stale" ? (
        <p className="oa-surface mb-4 border border-oa-border bg-oa-bg px-4 py-3 text-[14px] leading-5 text-oa-fg">
          This feed is paused. The newest headline is from {fmtStampET(wire.freshness.newestAt)}.
        </p>
      ) : null}

      {reading?.read ? <TheRead read={reading.read} label="The read" className="mb-4" /> : null}

      {reading && (themes.length || reading.buzz.length) ? (
        // Side by side only when both have something; one alone takes the whole row instead of leaving half of it empty.
        // Each card is as tall as its own content (owner rule 4), never stretched to its neighbour.
        <div className={`mb-6 grid items-start gap-4 lg:gap-5 ${themes.length && reading.buzz.length ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]" : ""}`}>
          <ThemesPanel themes={themes} filters={effective} />
          <TalkedAbout rows={reading.buzz} filters={effective} wide={themes.length === 0} />
        </div>
      ) : null}

      <WireFilterBar filters={effective} topicCounts={topicCounts} mineCount={mineCount} signedIn={Boolean(session)} />

      {effective.theme && !effective.ticker ? (
        <h2 className="mb-2 text-[15px] font-semibold leading-[22px] text-oa-fg">
          {effective.theme} <span className="oa-mono tabular-nums text-[13px] font-normal text-oa-muted-fg">· {matched.length} stories</span>
        </h2>
      ) : null}

      {effective.ticker ? (
        <TickerStrip ticker={effective.ticker} quote={wire.quotes[effective.ticker]} count={wire.items.length} tones={countTones(wire.items, wire.labels)} filters={effective} />
      ) : null}

      {streamView ? (
        <WireStream days={days} quotes={wire.quotes} filters={effective} shown={visible.length} total={matched.length} />
      ) : (
        <CompanyFeed groups={companies} filters={effective} shown={shownCompanies} canShowMore={canShowMore} signedIn={Boolean(session)} />
      )}
    </AppPage>
  );
}
