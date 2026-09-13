import { Inter_Tight } from "next/font/google";

import { Disclosure } from "@/components/oa/disclosure";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { MarketStatusBanner } from "@/components/market-status";
import { OaHeroSearch } from "@/components/oa/oa-hero-search";
import { OaButton } from "@/components/oa/button";
import { StartFreeButton } from "@/components/oa/start-free-button";
import { ProCheckoutButton } from "@/components/oa/pro-checkout-button";
import { SquircleCard, SquircleSurface } from "@/components/oa/squircle";
import { AnimatedIcon } from "@/components/animated-icon";
import { Reveal } from "@/components/reveal";
import { allBlogPosts } from "@/lib/blog-data";
import { listMarketDailyEditions } from "@/lib/market-daily";
import { PRO_POINTS } from "@/lib/subscribe-benefits";
import {
  HERO_HEADLINE_EMPHASIS,
  HERO_HEADLINE_LEAD,
  HERO_SUBHEAD,
} from "@/lib/brand-copy";
import { US_PRO_MONTHLY, US_PRO_YEARLY } from "@/lib/pricing";
import { getCurrentMarket } from "@/lib/market";
import { getDailyAnomalies, type AnomalyItem } from "@/lib/daily-anomalies";
import { anomalyTag, buildLandingSectorCards } from "@/lib/landing-sector-data";
import { getMarketSnapshot } from "@/lib/firestore";
import { getRedditCues } from "@/lib/reddit-cues";
import { getStockFacts, getStockIntelligenceDoc } from "@/lib/stock";
import { normalizeDirectiveForUi } from "@/lib/directive-ui";
import { buildLandingHeroMetrics } from "@/lib/landing-hero-metrics";
import {
  anomalyHeadline,
} from "@/components/daily-anomalies-shared";
import { StockLogo } from "@/components/stock-logo";
import {
  getLandingAnomalies,
  getLandingUserContext,
  resolveLandingHeroFeatured,
} from "@/components/terminal-landing-streams";

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-inter-tight",
});

const FRAME = "mx-auto w-full max-w-[76rem] px-4 sm:px-6";
const EYEBROW =
  "text-base uppercase tracking-[0.12em] text-oa-muted-fg";
const H2 =
  "text-balance font-medium tracking-tight text-oa-fg text-[28px] leading-tight sm:text-4xl sm:leading-tight";

function fmtPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function ChangeText({ pct, className = "" }: { pct: number; className?: string }) {
  const tone =
    pct >= 0
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-red-700 dark:text-red-400";
  return (
    <span className={`tabular-nums ${tone} ${className}`}>{fmtPct(pct)}</span>
  );
}

function RowLink({
  href,
  label,
  value,
  fullText = false,
}: {
  href: string;
  label: React.ReactNode;
  value?: React.ReactNode;
  fullText?: boolean;
}) {
  return (
    <a
      href={href}
      className="grid grid-cols-[1fr_auto] gap-3 px-3.5 py-5 text-base outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
    >
      <span className="flex min-w-0 flex-col gap-1">{label}</span>
      {value !== undefined ? (
        <div className="flex flex-col items-end justify-start gap-0.5 tabular-nums text-oa-muted-fg">
          {value}
        </div>
      ) : null}
    </a>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex h-8 items-center px-3.5 text-base text-oa-muted-fg">
      {children}
    </p>
  );
}

function Sparkline({ closes }: { closes: number[] }) {
  if (closes.length < 2) return null;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const pts = closes
    .map(
      (c, i) =>
        `${((i / (closes.length - 1)) * 100).toFixed(2)},${(30 - ((c - min) / range) * 26).toFixed(2)}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="h-16 w-full"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="var(--oa-primary)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function BriefStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[14px] leading-4 text-oa-muted-fg">{label}</p>
      <p className="truncate text-base font-medium tabular-nums text-oa-fg">
        {value}
        {sub ? <span className="ml-1.5 text-base font-normal text-oa-muted-fg">{sub}</span> : null}
      </p>
    </div>
  );
}

async function HeroBriefCard() {
  const market = getCurrentMarket();
  const anomalies = await getLandingAnomalies();
  const featured = await resolveLandingHeroFeatured(anomalies);

  if (!featured) {
    return (
      <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <div className="flex h-72 items-center justify-center rounded-[22px] bg-oa-bg text-base text-oa-muted-fg sm:h-80">
          Warming up. The first brief lands in a few minutes.
        </div>
      </SquircleSurface>
    );
  }

  const { anomaly, priceHistory } = featured;
  const [intelligence, stockFacts] = await Promise.all([
    getStockIntelligenceDoc(featured.anomaly.instrument_id, market).catch(() => null),
    getStockFacts(featured.anomaly.instrument_id).catch(() => null),
  ]);
  const directive = normalizeDirectiveForUi(intelligence?.directive_v2 ?? null);
  const analystTarget = stockFacts?.analyst?.target_price ?? null;
  const metrics = buildLandingHeroMetrics(directive, anomaly.price, analystTarget);

  const why =
    anomaly.move_explanation?.headline?.trim() ||
    anomaly.headline?.trim() ||
    anomaly.catalyst?.trim() ||
    directive?.text?.trim() ||
    "Tracking. We will explain the next move.";
  const closes = priceHistory.slice(-90).map((p) => p.close);

  const stats: { label: string; value: string; sub?: string }[] = [];
  if (typeof analystTarget === "number" && analystTarget > 0) {
    const roomPct = ((analystTarget - anomaly.price) / anomaly.price) * 100;
    stats.push({
      label: "Analyst target",
      value: `$${analystTarget.toFixed(0)}`,
      sub: `${roomPct >= 0 ? "+" : ""}${roomPct.toFixed(0)}% room`,
    });
  }
  if (metrics.accumulate_below != null) {
    stats.push({ label: "Add zone", value: `below $${metrics.accumulate_below.toFixed(0)}` });
  }
  if (metrics.trim_above != null) {
    stats.push({ label: "Trim zone", value: `above $${metrics.trim_above.toFixed(0)}` });
  }
  if (metrics.risk_reward_ratio != null && metrics.risk_reward_hint) {
    stats.push({
      label: "Risk / reward",
      value: `${metrics.risk_reward_ratio.toFixed(1)}x`,
      sub: metrics.risk_reward_hint.toLowerCase(),
    });
  }

  return (
    <a href={`/stock/${anomaly.ticker}`} className="group w-full block">
      <figure className="w-full">
        <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors group-hover:border-oa-accent">
          <div className="flex items-center justify-between gap-2 pb-2 pl-3.5 pr-2 pt-1.5">
            <h2 className="ml-1 flex items-center gap-2 text-base font-medium text-oa-fg/80">
              <span className="relative flex size-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              Live brief
            </h2>
            <span className="oa-mono rounded-full bg-oa-accent px-2 py-1 text-base text-oa-muted-fg">
              {anomaly.ticker}
            </span>
          </div>
          <SquircleSurface
            className="rounded-[22px] border border-oa-border bg-oa-bg p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] [--card-clip-radius:12px] sm:p-5 sm:rounded-[44px] sm:[--card-clip-radius:17px]"
          >
            <div className="flex items-center gap-2.5">
              <StockLogo ticker={anomaly.ticker} market={market === "IN" ? "IN" : "US"} size={26} circle eager />
              <p className="min-w-0 truncate text-base text-oa-muted-fg">{anomaly.name}</p>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-3xl font-medium tabular-nums tracking-tight text-oa-fg sm:text-4xl">
                ${anomaly.price?.toFixed(2)}
              </span>
              <ChangeText pct={anomaly.day_change_pct ?? 0} className="text-base font-medium" />
            </div>
            <p className="mt-3 text-base leading-6 text-oa-fg/80">{why}</p>
            {stats.length > 0 ? (
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-oa-border pt-3 sm:grid-cols-4">
                {stats.map((s) => (
                  <BriefStat key={s.label} {...s} />
                ))}
              </div>
            ) : null}
            <div className="mt-3">
              <Sparkline closes={closes} />
            </div>
          </SquircleSurface>
        </SquircleSurface>
        <figcaption className="mt-3 text-center text-base text-oa-muted-fg">
          A real brief from today&apos;s market. Every stock gets one.
        </figcaption>
      </figure>
    </a>
  );
}

async function LiveProofCards() {
  const market = getCurrentMarket();
  const [anomaliesDoc, snapshotRows, reddit] = await Promise.all([
    getDailyAnomalies(market).catch(() => null),
    getMarketSnapshot(market).catch(() => []),
    getRedditCues(market).catch(() => null),
  ]);

  const movers = anomaliesDoc?.anomalies ?? [];
  const sectors = buildLandingSectorCards(snapshotRows)
    .slice()
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);
  const buzz = (reddit?.tickers ?? [])
    .filter((t) => t.summary?.trim())
    .slice(0, 4);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:auto-rows-fr">
      <Reveal delay={80}>
        <SquircleCard title="What moved and why" seeAllHref="/pulse" contentClassName="h-80 overflow-y-auto">
          {movers.length === 0 ? (
            <EmptyRow>Warming up. Check back in a few minutes.</EmptyRow>
          ) : (
            movers.map((a: AnomalyItem) => (
              <RowLink
                key={a.instrument_id}
                href={`/stock/${a.ticker}`}
                label={
                  <>
                    <div className="flex items-center gap-2">
                      <StockLogo ticker={a.ticker} size={18} circle />
                      <span className="oa-mono text-base text-oa-fg">{a.ticker}</span>
                    </div>
                    <span className="min-w-0 text-oa-muted-fg">
                      {anomalyTag(a)}
                    </span>
                  </>
                }
                value={
                  <>
                    <span className="tabular-nums text-oa-fg">${a.price.toFixed(2)}</span>
                    <ChangeText pct={a.day_change_pct ?? 0} />
                  </>
                }
              />
            ))
          )}
        </SquircleCard>
      </Reveal>

      <Reveal delay={160}>
        <SquircleCard title="Reddit buzz" seeAllHref="/reddit-buzz" contentClassName="h-80 overflow-y-auto">
          {buzz.length === 0 ? (
            <EmptyRow>Buzz refreshes through the day.</EmptyRow>
          ) : (
            buzz.map((t) => (
              <RowLink
                key={t.ticker}
                href={`/stock/${t.ticker}`}
                label={
                  <>
                    <div className="flex items-center gap-2">
                      <StockLogo ticker={t.ticker} size={18} circle />
                      <span className="oa-mono text-base text-oa-fg">{t.ticker}</span>
                    </div>
                    <span className="min-w-0 text-oa-muted-fg">
                      {t.summary}
                    </span>
                  </>
                }
                value={
                  <span
                    className={`capitalize font-medium ${
                      t.sentiment === "bullish"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : t.sentiment === "bearish"
                          ? "text-red-700 dark:text-red-400"
                          : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {t.sentiment || "neutral"}
                  </span>
                }
              />
            ))
          )}
        </SquircleCard>
      </Reveal>
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Look up any stock",
    body: "Financials, valuation, earnings and news on one page, in plain English.",
  },
  {
    n: "02",
    title: "Track what you own",
    body: "We keep watching after you close the tab. You hear only when something changes.",
  },
  {
    n: "03",
    title: "Ask your AI",
    body: "Connect Claude or ChatGPT and question your watchlist in plain English.",
  },
];

const FAQS = [
  {
    q: "What do I get for free?",
    a: "Search any US stock and track up to three names in your Watchlist. Pro adds detailed calls, price zones, targets, unlimited tracking and alerts.",
  },
  {
    q: "What does Pro actually add?",
    a: "Detailed calls, price zones and targets, unlimited Watchlist stocks, alerts, and access from compatible AI agents.",
  },
  {
    q: "Can I use Stocksbrew in Claude Code, Cursor, or Codex?",
    a: "Yes. Pro includes MCP and REST access for current stock research, your Watchlist, changes and alerts. You choose narrow read and write scopes. Stocksbrew cannot place trades or move money.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. Pro includes 3 days of full access free. Then $9/month. Cancel anytime.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. One click, no questions asked, and you keep access until the period you paid for runs out.",
  },
  {
    q: "Is this investment advice?",
    a: "No. Stocksbrew provides research for your own decisions. It is not a broker and cannot place trades or move money.",
  },
];

export async function OaLanding() {
  const [user, marketDailyEditions] = await Promise.all([
    getLandingUserContext(),
    listMarketDailyEditions(3).catch(() => []),
  ]);

  const marketNowIso = new Date().toISOString();

  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <OaSiteHeader />

      <div className={FRAME}>
        <MarketStatusBanner nowIso={marketNowIso} surface="home" className="mt-8" />
        {/* hero */}
        <section className="grid grid-cols-1 items-center gap-10 pb-4 pt-10 sm:gap-14 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <h1 className="text-balance font-medium tracking-tight text-oa-fg text-[2.5rem] leading-[1.06] sm:text-6xl sm:leading-[1.04]">
              {HERO_HEADLINE_LEAD}{" "}
              <span className="text-oa-muted-fg">{HERO_HEADLINE_EMPHASIS}</span>
            </h1>
            <p className="text-pretty mt-5 max-w-lg text-base leading-7 text-oa-muted-fg">
              {HERO_SUBHEAD}
            </p>
            <div className="mt-8">
              <OaHeroSearch source="hero" />
            </div>
            {user.signedIn ? (
              <p className="mt-3 text-base text-oa-muted-fg">
                {user.isSubscribed
                  ? "Pro is active. Every stock you follow stays current."
                  : `Tracking ${user.trackedIds.length} of 3 free stocks.`}
              </p>
            ) : (
              <p className="mt-3 text-base text-oa-muted-fg">
                Free forever for 3 stocks. No card required.
              </p>
            )}
          </div>
          <div className="flex justify-center lg:justify-end">
            <HeroBriefCard />
          </div>
        </section>

        {/* everything below stacks as plates; the page background between them is the only divider */}
        <div className="flex flex-col gap-12 pb-12 pt-8 sm:gap-20 sm:pb-20 sm:pt-12">
          {/* product proof */}
          <section id="live" className="scroll-mt-24">
            <Reveal>
              <div className="mb-6 max-w-2xl">
                <h2 className={H2}>What moved and why</h2>
              </div>
            </Reveal>
            <LiveProofCards />
          </section>

          {/* how it works */}
          <section>
            <Reveal>
              <div className="mb-6 max-w-2xl">
                <h2 className={H2}>Three steps, then get on with your day.</h2>
              </div>
            </Reveal>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {STEPS.map((step, i) => (
                <Reveal key={step.n} delay={80 * (i + 1)}>
                  <SquircleSurface className="h-full border border-oa-border p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:p-6">
                    <p className="oa-mono text-base text-oa-muted-fg">{step.n}</p>
                    <h3 className="mt-4 text-[20px] font-medium tracking-tight text-oa-fg">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-base leading-6 text-oa-muted-fg">{step.body}</p>
                  </SquircleSurface>
                </Reveal>
              ))}
            </div>
          </section>

          {/* pricing: hidden once you already subscribe */}
          {!user.isSubscribed ? (
            <section id="pricing" className="scroll-mt-24">
            <Reveal>
              <SquircleSurface className="bg-oa-bg px-6 py-10 sm:px-10 sm:py-14">
                <div className="mx-auto max-w-xl text-center">
                  <h2 className="text-balance font-medium tracking-tight text-oa-fg text-[28px] leading-tight sm:text-4xl">
                    Pro when you're ready to follow more names.
                  </h2>
                </div>
                <ul className="mx-auto mt-10 grid max-w-3xl gap-x-8 gap-y-8 sm:grid-cols-2">
                  {PRO_POINTS.map((point) => (
                    <li key={point.icon} className="flex items-start gap-3.5">
                      <span
                        aria-hidden="true"
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-oa-card text-oa-fg/70 shadow-[0_1px_2px_rgba(0,0,0,0.06)] [&_svg]:size-[18px]"
                      >
                        <AnimatedIcon name={point.icon} size={18} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[17px] font-medium leading-6 text-oa-fg">{point.title}</span>
                        <span className="mt-0.5 block text-[16px] leading-6 text-oa-muted-fg">{point.body}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <ProCheckoutButton size="md" className="h-11 px-6 text-base">Try Pro</ProCheckoutButton>
                  <p className="text-[16.5px] text-oa-muted-fg">
                    <span className="font-medium tabular-nums text-oa-fg">${US_PRO_MONTHLY}/mo</span> · 3-day full trial · cancel anytime
                  </p>
                </div>
                <p className="mt-6 text-center text-[13px] text-oa-muted-fg">
                  Free forever: search any US stock, plain-English briefs, track 3 stocks.{" "}
                  <StartFreeButton surface="landing_pro_preview" size="sm" variant="secondary" label="Start free" className="ml-1 h-8 px-3 text-[13px] align-middle" />
                </p>
              </SquircleSurface>
            </Reveal>
          </section>
          ) : null}

          {/* faq */}
          <section id="faq" className="scroll-mt-24">
            <Reveal>
              <div className="mx-auto max-w-3xl">
                <h2 className={`${H2} mb-4`}>Questions, answered</h2>
                {FAQS.map((item) => (
                  <Disclosure key={item.q} question={item.q}>
                    {item.a}
                  </Disclosure>
                ))}
              </div>
            </Reveal>
          </section>

          {/* daily dispatch section */}
          <section>
            <Reveal>
              <div className="mb-6 flex items-center justify-between">
                <h2 className={H2}>Daily dispatch</h2>
                <a href="/market-daily" className="text-base font-medium text-oa-primary hover:underline">View all →</a>
              </div>
            </Reveal>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {marketDailyEditions.length > 0 ? (
                marketDailyEditions.map((edition, i) => (
                  <Reveal key={edition.edition_date} delay={80 * (i + 1)}>
                    <a href={`/market-daily/${edition.edition_date}`}>
                      <SquircleSurface className="group h-full border border-oa-border shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors hover:border-oa-accent">
                        <div className="flex h-full flex-col bg-oa-bg px-5 py-6 text-left sm:px-6 sm:py-7">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-oa-muted-fg">Market Daily</span>
                          <h3 className="mt-3 text-[17px] font-medium tracking-tight text-oa-fg">{edition.headline}</h3>
                          <p className="mt-2 flex-grow text-base leading-5 text-oa-muted-fg">{edition.dek}</p>
                          <p className="mt-3 text-[13px] text-oa-muted-fg">{edition.edition_date}</p>
                        </div>
                      </SquircleSurface>
                    </a>
                  </Reveal>
                ))
              ) : (
                allBlogPosts.slice(0, 3).map((post, i) => (
                  <Reveal key={post.slug} delay={80 * (i + 1)}>
                    <a href={`/blog/${post.slug}`}>
                      <SquircleSurface className="group h-full border border-oa-border shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors hover:border-oa-accent">
                        <div className="flex h-full flex-col bg-oa-bg px-5 py-6 text-left sm:px-6 sm:py-7">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-oa-muted-fg">{post.category}</span>
                          <h3 className="mt-3 text-[17px] font-medium tracking-tight text-oa-fg">{post.title}</h3>
                          <p className="mt-2 flex-grow text-base leading-5 text-oa-muted-fg">{post.description}</p>
                          <p className="mt-3 text-[13px] text-oa-muted-fg">{post.date}</p>
                        </div>
                      </SquircleSurface>
                    </a>
                  </Reveal>
                ))
              )}
            </div>
          </section>

          {/* footer */}
          <footer className="flex flex-col items-center justify-between gap-3 text-base text-oa-muted-fg sm:flex-row">
            <p>Research for your own decisions. Not financial advice.</p>
            <nav className="flex items-center gap-4" aria-label="Footer">
              <a href="/about" className="transition-colors hover:text-oa-fg">About</a>
              <a href="/blog" className="transition-colors hover:text-oa-fg">Blog</a>
              <a href="/developers" className="transition-colors hover:text-oa-fg">Developers</a>
            </nav>
          </footer>
        </div>
      </div>
    </main>
  );
}
