import { anomalyHeadline, hasResearchBackedNarrative } from "@/components/daily-anomalies-shared";
import { companyFirstMove, plainFinance } from "@/lib/plain-copy";
import { sharedCache } from "@/lib/shared-cache";
import { SquircleCard } from "@/components/oa/squircle";
import { Reveal } from "@/components/reveal";
import { StockLogo } from "@/components/stock-logo";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getEarnings } from "@/lib/earnings";
import { getMarketSnapshot } from "@/lib/firestore";
import {
  SECTOR_HREF_BY_LABEL,
  buildLandingPriceMovers,
  buildLandingSectorCards,
} from "@/lib/landing-sector-data";
import { getCurrentMarket } from "@/lib/market";
import { getNewsFeed } from "@/lib/news";
import { getPowerTradesCached } from "@/lib/power-trades";
import { getRedditCues, hasRedditBrief } from "@/lib/reddit-cues";
import { getTrumpLogic } from "@/lib/trump-logic";

import {
  ChangeText,
  EmptyRow,
  RowLink,
  fmtAmountRange,
  fmtDay,
  fmtPrice,
  initials,
  toneClass,
} from "./shared";

// Each feed shows a whole number of rows and stops; "See all" in the card head goes to the rest. No faded half-row.
const INSET = "pb-1";
const NEWS_MAX_AGE_DAYS = 7;

/** A move's reason in plain words, company first when the feed wrote the cause first ("Zeta rose after strong earnings"). */
function moveLine(item: { ticker: string; name: string; day_change_pct: number } & Parameters<typeof anomalyHeadline>[0]): string {
  const said = plainFinance(anomalyHeadline(item));
  const turned = companyFirstMove(said.replace(/\.$/, ""), item.day_change_pct, { company: { name: item.name, ticker: item.ticker } });
  return turned ? `${turned}.` : said;
}
const CARD_COUNT = 6;

function Ticker({ symbol, logo = true }: { symbol: string; logo?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      {logo ? <StockLogo ticker={symbol} size={18} circle /> : null}
      <span className="oa-mono text-oa-fg">{symbol}</span>
    </span>
  );
}

function Detail({ children, clamp = 2 }: { children: React.ReactNode; clamp?: 1 | 2 | 3 }) {
  const clampClass = clamp === 1 ? "line-clamp-1" : clamp === 3 ? "line-clamp-3" : "line-clamp-2";
  return <span className={`${clampClass} text-oa-muted-fg`}>{children}</span>;
}

function sentimentTone(sentiment: string | null | undefined): "up" | "down" | "flat" {
  const value = (sentiment ?? "").toLowerCase();
  if (value === "bullish" || value === "positive") return "up";
  if (value === "bearish" || value === "negative") return "down";
  return "flat";
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

const SESSION_LABEL: Record<string, string> = {
  bmo: "Before open",
  amc: "After close",
  during: "During hours",
};

/**
 * "Track everything that moves your stocks": six live feeds, one card each.
 * Every card reads the same collection its full page reads, so the landing
 * can never show something the product does not have.
 */
// Both of these are the same for every visitor and slow to read (the policy
// feed alone took about 2.5 seconds per request). They throw when the read
// comes back empty so a failed read is never what gets cached.
const cachedTrumpLogic = sharedCache(
  async (market: Parameters<typeof getTrumpLogic>[0]) => {
    const doc = await getTrumpLogic(market);
    if (!doc) throw new Error("trump_logic_empty");
    return doc;
  },
  ["landing-trump-logic-v1"],
  { revalidate: 600 },
);
const cachedEarnings = sharedCache(
  async (market: Parameters<typeof getEarnings>[0], from: string, to: string) => {
    const rows = await getEarnings(market, from, to);
    if (rows.length === 0) throw new Error("earnings_empty");
    return rows;
  },
  ["landing-earnings-v1"],
  { revalidate: 900 },
);
// The other five feeds are also the same for everyone; read them together and
// keep them for two minutes so the grid does not wait on five store reads per visit.
const cachedFeeds = sharedCache(
  async (market: ReturnType<typeof getCurrentMarket>) => {
    const result = await Promise.all([
      getDailyAnomalies(market).catch(() => null),
      getMarketSnapshot(market).catch(() => []),
      getPowerTradesCached(60).catch(() => null),
      getRedditCues(market).catch(() => null),
      getNewsFeed(market, 12).catch(() => []),
    ] as const);
    const [anomalies, snapshot, trades, reddit, news] = result;
    if (!anomalies && snapshot.length === 0 && !trades && !reddit && news.length === 0) throw new Error("track_feeds_empty");
    return result;
  },
  ["landing-track-feeds-v1"],
  { revalidate: 120 },
);

/** `only` picks which feeds show and in what order (all by default); `rows` caps each card. */
export async function TrackGrid({ only, rows = 8 }: { only?: string[]; rows?: number } = {}) {
  const market = getCurrentMarket();
  const today = new Date().toISOString().slice(0, 10);
  const inThreeWeeks = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);

  const [feeds, earnings, trump] = await Promise.all([
    cachedFeeds(market).catch(() => null),
    cachedEarnings(market, today, inThreeWeeks).catch(() => []),
    cachedTrumpLogic(market).catch(() => null),
  ]);
  const anomaliesDoc = feeds?.[0] ?? null;
  const snapshotRows = [...(feeds?.[1] ?? [])];
  const trades = feeds?.[2] ?? null;
  const reddit = feeds?.[3] ?? null;
  const news = [...(feeds?.[4] ?? [])];

  const explained = (anomaliesDoc?.anomalies ?? []).filter(hasResearchBackedNarrative).slice(0, rows);
  const priceMovers = explained.length === 0 ? buildLandingPriceMovers(snapshotRows, market) : [];

  const upcoming = [...earnings]
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
    .slice(0, rows);

  const latestTrades = [...(trades?.trades ?? [])]
    .filter((t) => t.ticker && (t.tx_type === "buy" || t.tx_type === "sell"))
    .sort((a, b) => (b.disclosure_date ?? "").localeCompare(a.disclosure_date ?? ""))
    .slice(0, rows);

  const buzz = (reddit?.tickers ?? []).filter(hasRedditBrief).slice(0, 6);
  // A week-old headline is not news. If the feed is stale the card steps aside.
  const newsCutoff = Date.now() - NEWS_MAX_AGE_DAYS * 86400000;
  const headlines = news
    .filter((article) => article.title?.trim() && Date.parse(article.published_at) >= newsCutoff)
    .slice(0, 7);
  const sectors = buildLandingSectorCards(snapshotRows).sort((a, b) => b.avg - a.avg);
  const posts = (trump?.mentions ?? [])
    .filter((mention) => mention.tickers.length > 0 && mention.said?.trim())
    .slice(0, 6);

  const cards: { key: string; hasData: boolean; node: React.ReactNode }[] = [
    {
      key: "moves",
      hasData: explained.length > 0 || priceMovers.length > 0,
      node: (
        <SquircleCard title="Price moves, with the reason" seeAllHref="/signals?tab=movers" contentClassName={INSET}>
          {explained.length > 0 ? (
            explained.map((item) => (
              <RowLink
                key={item.instrument_id}
                href={`/stock/${item.ticker}`}
                label={
                  <>
                    <Ticker symbol={item.ticker} />
                    <Detail>{moveLine(item)}</Detail>
                  </>
                }
                value={
                  <>
                    <span className="text-oa-fg">{fmtPrice(item.price)}</span>
                    <ChangeText pct={item.day_change_pct ?? 0} />
                  </>
                }
              />
            ))
          ) : priceMovers.length > 0 ? (
            <>
              <EmptyRow>Today&apos;s biggest moves. Reasons are on the way.</EmptyRow>
              {priceMovers.map((row) => (
                <RowLink
                  key={row.instrumentId}
                  href={`/stock/${row.symbol}`}
                  label={
                    <>
                      <Ticker symbol={row.symbol} />
                      <Detail clamp={1}>{row.name}</Detail>
                    </>
                  }
                  value={
                    <>
                      <span className="text-oa-fg">{fmtPrice(row.price.current)}</span>
                      <ChangeText pct={row.price.changePct ?? 0} />
                    </>
                  }
                />
              ))}
            </>
          ) : (
            <EmptyRow>No moves to report yet. This fills in after the market opens.</EmptyRow>
          )}
        </SquircleCard>
      ),
    },
    {
      key: "earnings",
      hasData: upcoming.length > 0,
      node: (
        <SquircleCard title="Earnings coming up" seeAllHref="/calendar" contentClassName={INSET}>
          {upcoming.length > 0 ? (
            upcoming.map((event) => (
              <RowLink
                key={`${event.ticker}-${event.event_date}`}
                href={`/stock/${event.ticker}`}
                label={
                  <>
                    <Ticker symbol={event.ticker} />
                    <Detail clamp={1}>{event.company}</Detail>
                  </>
                }
                value={
                  <>
                    <span className="text-oa-fg">{fmtDay(event.event_date)}</span>
                    <span>{SESSION_LABEL[event.time] ?? ""}</span>
                  </>
                }
              />
            ))
          ) : (
            <EmptyRow>No earnings on the calendar for the next three weeks.</EmptyRow>
          )}
        </SquircleCard>
      ),
    },
    {
      key: "congress",
      hasData: latestTrades.length > 0,
      node: (
        <SquircleCard title="What Congress bought and sold" seeAllHref="/follow?tab=congress" contentClassName={INSET}>
          {latestTrades.length > 0 ? (
            latestTrades.map((trade) => (
              <RowLink
                key={trade.trade_id}
                href="/follow?tab=congress"
                label={
                  <>
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-oa-secondary text-[9px] font-medium text-oa-secondary-fg"
                      >
                        {initials(trade.person_name)}
                      </span>
                      <span className="truncate text-oa-fg">{trade.person_name}</span>
                    </span>
                    <Detail clamp={1}>
                      {fmtAmountRange(trade.amount_low, trade.amount_high)}
                      {trade.disclosure_date ? `, filed ${fmtDay(trade.disclosure_date)}` : ""}
                    </Detail>
                  </>
                }
                value={
                  <>
                    <span className="oa-mono text-oa-fg">{trade.ticker}</span>
                    <span className={toneClass(trade.tx_type === "buy" ? "up" : "down")}>
                      {trade.tx_type === "buy" ? "Bought" : "Sold"}
                    </span>
                  </>
                }
              />
            ))
          ) : (
            <EmptyRow>No new disclosures in the last 60 days.</EmptyRow>
          )}
        </SquircleCard>
      ),
    },
    {
      key: "reddit",
      hasData: buzz.length > 0,
      node: (
        <SquircleCard title="What investors are saying" seeAllHref="/signals?tab=reddit" contentClassName={INSET}>
          {buzz.length > 0 ? (
            buzz.map((item) => (
              <RowLink
                key={item.ticker}
                href={`/stock/${item.ticker}`}
                label={
                  <>
                    <Ticker symbol={item.ticker} />
                    <Detail clamp={3}>{item.summary}</Detail>
                  </>
                }
                value={
                  <span className={toneClass(sentimentTone(item.sentiment))}>
                    {capitalize(item.sentiment || "neutral")}
                  </span>
                }
              />
            ))
          ) : (
            <EmptyRow>No Reddit chatter yet today.</EmptyRow>
          )}
        </SquircleCard>
      ),
    },
    {
      key: "news",
      hasData: headlines.length > 0,
      node: (
        <SquircleCard title="News on the companies" seeAllHref="/news" contentClassName={INSET}>
          {headlines.length > 0 ? (
            headlines.map((article) => (
              <RowLink
                key={article.id}
                href={article.url}
                external
                label={
                  <>
                    <span className="line-clamp-2 text-oa-fg">{article.title}</span>
                    <Detail clamp={1}>
                      {article.source_name}
                      {article.published_at ? `, ${fmtDay(article.published_at)}` : ""}
                    </Detail>
                  </>
                }
                value={
                  article.tickers[0] ? <span className="oa-mono text-oa-fg">{article.tickers[0]}</span> : undefined
                }
              />
            ))
          ) : (
            <EmptyRow>No new articles yet today.</EmptyRow>
          )}
        </SquircleCard>
      ),
    },
    {
      key: "trump",
      hasData: posts.length > 0,
      node: (
        <SquircleCard title="Trump posts that name a stock" seeAllHref="/signals?tab=policy" contentClassName={INSET}>
          {posts.length > 0 ? (
            posts.map((post) => {
              const move = post.ticker_moves?.find((m) => m.change_since_pct != null);
              return (
                <RowLink
                  key={post.post_id}
                  href="/signals?tab=policy"
                  label={
                    <>
                      <Ticker symbol={post.tickers[0] ?? ""} />
                      <Detail clamp={3}>{post.said}</Detail>
                    </>
                  }
                  value={
                    <>
                      <span>{fmtDay(post.published_at)}</span>
                      {move && typeof move.change_since_pct === "number" ? (
                        <ChangeText pct={move.change_since_pct} />
                      ) : null}
                    </>
                  }
                />
              );
            })
          ) : (
            <EmptyRow>No posts naming a public company in the current window.</EmptyRow>
          )}
        </SquircleCard>
      ),
    },
    {
      key: "sectors",
      hasData: sectors.length > 0,
      node: (
        <SquircleCard title="Sectors today" seeAllHref="/screener?tab=sectors" contentClassName={INSET}>
          {sectors.map((sector) => {
            const best = sector.stocks[0];
            const worst = sector.stocks[sector.stocks.length - 1];
            return (
              <RowLink
                key={sector.label}
                href={SECTOR_HREF_BY_LABEL[sector.label] ?? "/sectors"}
                label={
                  <>
                    <span className="text-oa-fg">{sector.label}</span>
                    <Detail clamp={1}>
                      {best ? `${best.ticker} leads` : ""}
                      {best && worst && worst.ticker !== best.ticker ? `, ${worst.ticker} trails` : ""}
                    </Detail>
                  </>
                }
                value={<ChangeText pct={sector.avg} />}
              />
            );
          })}
        </SquircleCard>
      ),
    },
  ];

  // Feeds with nothing fresh step aside so the grid never shows an empty or stale card.
  const picked = only ? only.map((key) => cards.find((card) => card.key === key)).filter((card): card is (typeof cards)[number] => Boolean(card)) : cards;
  const visible = picked.filter((card) => card.hasData).slice(0, CARD_COUNT);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((card, index) => (
        <Reveal key={card.key} delay={60 * ((index % 3) + 1)}>
          {card.node}
        </Reveal>
      ))}
    </div>
  );
}
