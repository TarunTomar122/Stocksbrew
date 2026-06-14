"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { StockLogo } from "@/components/stock-logo";
import { useUser } from "@/lib/auth-context";
import { ProCtaButton } from "@/components/pro-cta";
import type { AnomalyItem } from "@/lib/daily-anomalies";
import { PRO_LOCKED_FEED_TEASER } from "@/lib/pro-features";
import {
  type PaywallSurface,
  trackPaywallShown,
  trackPaywallUnlockClicked,
} from "@/lib/product-analytics";
import type { RedditTicker } from "@/lib/reddit-cues-shared";
import { signInWithGoogle } from "@/lib/sign-in";

type Benefit = { icon: string; title: string; body: string };

type Theme = {
  shell: string;
  badge: string;
  benefitBorder: string;
  iconColor: string;
  pill: string;
  examplePanel: string;
};

const THEMES: Record<"anomaly" | "reddit", Theme> = {
  anomaly: {
    shell: "border-[#e5e7eb] bg-white",
    badge: "bg-[#dbeafe] text-[#1d4ed8]",
    benefitBorder: "border-[#e5e7eb]",
    iconColor: "#0052ff",
    pill: "border-[#dbeafe] bg-[#f8fafc] text-[#1d4ed8]",
    examplePanel: "bg-[#fafafa]",
  },
  reddit: {
    shell: "border-[#e5e7eb] bg-white",
    badge: "bg-[#ffedd5] text-[#c2410c]",
    benefitBorder: "border-[#e5e7eb]",
    iconColor: "#ea580c",
    pill: "border-[#ffedd5] bg-[#fffaf5] text-[#c2410c]",
    examplePanel: "bg-[#fafafa]",
  },
};

const ANOMALY_BENEFITS: Benefit[] = [
  {
    icon: "bolt",
    title: "Why it moved",
    body: "Every anomaly comes with a plain-language read on what triggered the move.",
  },
  {
    icon: "newspaper",
    title: "News translated",
    body: "Headlines turned into what changed and why the stock should care.",
  },
  {
    icon: "monitoring",
    title: "Full live feed",
    body: "See every name surging or dropping outside its normal range today.",
  },
  {
    icon: "radar",
    title: "Track in Radar",
    body: "Add any mover to your list and get the same read on your book.",
  },
];

const REDDIT_BENEFITS: Benefit[] = [
  {
    icon: "forum",
    title: "Crowd sentiment",
    body: "Bullish, bearish, or neutral — with mention heat, not just ticker spam.",
  },
  {
    icon: "chat",
    title: "What they're saying",
    body: "Narrative summaries of what Reddit is actually debating on each name.",
  },
  {
    icon: "local_fire_department",
    title: "Catalyst themes",
    body: "The hooks driving chatter — earnings, guidance, product hype, fear.",
  },
  {
    icon: "travel_explore",
    title: "Full buzz scan",
    body: "Unlock every buzzing name from r/stocks and related subs.",
  },
];

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return "-";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

function useProPaywallCta(surface: PaywallSurface) {
  const { user } = useUser();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    trackPaywallShown({
      surface,
      signedIn: Boolean(user),
    });
  }, [surface, user]);

  async function handleUnlock() {
    trackPaywallUnlockClicked({
      surface,
      signedIn: Boolean(user),
    });
    if (!user) {
      setBusy(true);
      try {
        await signInWithGoogle({ surface: "paywall" });
        router.push("/subscribe");
      } catch (err) {
        console.error("sign-in failed", err);
      } finally {
        setBusy(false);
      }
      return;
    }
    router.push("/subscribe");
  }

  return { user, busy, handleUnlock };
}

function ContextualFeedPaywallShell({
  surface,
  theme,
  title,
  description,
  benefits,
  tickerPills,
  exampleTitle,
  exampleCaption,
  exampleCard,
}: {
  surface: PaywallSurface;
  theme: Theme;
  title: string;
  description: string;
  benefits: Benefit[];
  tickerPills?: { label: string; tickers: string[] };
  exampleTitle: string;
  exampleCaption: string;
  exampleCard: ReactNode;
}) {
  const { user, busy, handleUnlock } = useProPaywallCta(surface);

  return (
    <section
      className={`overflow-hidden rounded-[24px] border shadow-[0_12px_40px_rgba(17,24,39,0.06)] ${theme.shell}`}
    >
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-5 p-5 md:p-7 lg:p-8">
          <div className="flex flex-col gap-2.5">
            <span
              className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] uppercase ${theme.badge}`}
            >
              <span aria-hidden>★</span> stocksbrew Pro
            </span>
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#111111] leading-tight md:text-[28px]">
              {title}
            </h2>
            <p className="max-w-[520px] text-[14px] leading-relaxed text-[#374151] md:text-[15px]">
              {description}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <div
                key={benefit.title}
                className={`flex gap-3 rounded-2xl border bg-white/80 px-3.5 py-3 ${theme.benefitBorder}`}
              >
                <span
                  aria-hidden
                  className="material-symbols-outlined mt-0.5 shrink-0"
                  style={{ fontSize: 20, color: theme.iconColor, fontVariationSettings: "'wght' 500" }}
                >
                  {benefit.icon}
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold text-[#111111]">{benefit.title}</span>
                  <span className="text-[12px] leading-snug text-[#6b7280]">{benefit.body}</span>
                </div>
              </div>
            ))}
          </div>

          {tickerPills && tickerPills.tickers.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">
                {tickerPills.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {tickerPills.tickers.slice(0, 14).map((ticker) => (
                  <span
                    key={ticker}
                    className={`inline-flex rounded-full border bg-white px-2.5 py-1 text-[12px] font-semibold ${theme.pill}`}
                  >
                    {ticker}
                  </span>
                ))}
                {tickerPills.tickers.length > 14 ? (
                  <span className="inline-flex rounded-full border border-dashed border-[#d1d5db] bg-[#fafafa] px-2.5 py-1 text-[12px] font-semibold text-[#6b7280]">
                    {PRO_LOCKED_FEED_TEASER} more
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 pt-0.5 sm:max-w-[300px]">
            <ProCtaButton type="button" disabled={busy} onClick={handleUnlock} fullWidth showStar>
              {busy ? "Signing you in…" : user ? "Choose Pro" : "Sign in & choose Pro"}
              {!busy && <span aria-hidden>→</span>}
            </ProCtaButton>
            <span className="text-center text-[11px] font-medium text-[#9ca3af] sm:text-left">
              Yearly includes 3 days free. Monthly starts today.
            </span>
          </div>
        </div>

        <div
          className={`flex flex-col gap-3 p-5 md:p-7 lg:p-8 ${theme.examplePanel}`}
        >
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">
              {exampleTitle}
            </p>
            <p className="text-[13px] text-[#6b7280]">{exampleCaption}</p>
          </div>
          {exampleCard}
        </div>
      </div>
    </section>
  );
}

function AnomalyExampleCard({ item }: { item: AnomalyItem }) {
  const isUp = item.direction === "up";
  const changeColor = isUp ? "#10b981" : "#ef4444";
  const changeBg = isUp ? "#ecfdf5" : "#fef2f2";
  const brief = (item.today_brief || item.key_points?.[0] || "").trim();
  const whatChanged = item.visual_summary?.what_changed?.trim();
  const whyItMatters = item.visual_summary?.why_it_matters?.trim();
  const watch = item.visual_summary?.what_to_watch?.trim();

  return (
    <div
      aria-hidden
      className="flex h-full flex-col gap-3 rounded-[20px] border border-[#e5e7eb] bg-white p-4 shadow-[0_12px_40px_rgba(0,82,255,0.06)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <StockLogo ticker={item.ticker} logoUrl={item.logo_url} size={36} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-[#111111]">
              {item.ticker}
            </span>
            <span className="text-[11px] leading-snug text-[#9ca3af]">{item.name}</span>
          </div>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums"
          style={{ background: changeBg, color: changeColor }}
        >
          {isUp ? "▲" : "▼"} {fmtPct(item.day_change_pct)}
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold tabular-nums text-[#111111]">${fmtPrice(item.price)}</span>
        {item.day_change_abs != null ? (
          <span className="text-[11px] font-medium tabular-nums" style={{ color: changeColor }}>
            {isUp ? "+" : ""}
            {item.day_change_abs.toFixed(2)}
          </span>
        ) : null}
      </div>

      {item.headline ? (
        <p className="text-[13px] font-medium leading-snug text-[#111111]">{item.headline}</p>
      ) : null}
      {brief && brief !== item.headline ? (
        <p className="text-[12px] leading-snug text-[#6b7280]">{brief}</p>
      ) : null}

      {(whatChanged || whyItMatters) && (
        <div className="grid grid-cols-1 gap-2">
          {whatChanged ? (
            <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9ca3af]">
                What changed
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-[#111111]">{whatChanged}</p>
            </div>
          ) : null}
          {whyItMatters ? (
            <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9ca3af]">
                Why it matters
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-[#111111]">{whyItMatters}</p>
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-auto flex flex-wrap gap-1.5">
        {item.catalyst ? (
          <span className="inline-flex rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-semibold text-[#374151]">
            {item.catalyst}
          </span>
        ) : null}
        {watch ? (
          <span className="inline-flex max-w-full whitespace-normal rounded-full bg-[#eff6ff] px-2 py-0.5 text-[10px] font-semibold leading-snug text-[#1d4ed8]">
            {watch}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RedditExampleCard({ item }: { item: RedditTicker }) {
  const sentiment = item.sentiment?.toLowerCase() ?? "neutral";
  const color = sentiment === "bullish" ? "#10b981" : sentiment === "bearish" ? "#ef4444" : "#6b7280";
  const bg = sentiment === "bullish" ? "#ecfdf5" : sentiment === "bearish" ? "#fef2f2" : "#f3f4f6";
  const label = sentiment === "bullish" ? "Bullish" : sentiment === "bearish" ? "Bearish" : "Neutral";
  const catalysts = (item.catalysts ?? []).filter(Boolean).slice(0, 3);

  return (
    <div
      aria-hidden
      className="flex h-full flex-col gap-3 rounded-[20px] border border-[#e5e7eb] bg-[#f9fafb] p-4 shadow-[0_12px_40px_rgba(234,88,12,0.06)]"
    >
      <div className="flex items-center gap-2 min-w-0">
        <StockLogo ticker={item.ticker} market="US" size={32} />
        <span className="text-[14px] font-bold text-[#111111]">{item.ticker}</span>
        <div className="flex items-center gap-1" style={{ color }}>
          <span className="text-[11px] font-bold tabular-nums">{item.mention_count}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide">mentions</span>
        </div>
        <span
          className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ background: bg, color }}
        >
          {label}
        </span>
      </div>

      {item.summary ? (
        <p className="text-[13px] font-medium leading-snug text-[#374151]">{item.summary}</p>
      ) : null}

      {catalysts.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9ca3af]">
            Driving the chatter
          </p>
          <div className="flex flex-wrap gap-1.5">
            {catalysts.map((catalyst) => (
              <span
                key={catalyst}
                className="inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#374151] ring-1 ring-[#e5e7eb]"
              >
                {catalyst}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const GENERIC_ANOMALY: AnomalyItem = {
  instrument_id: "US_ZS",
  ticker: "ZS",
  name: "Zscaler, Inc.",
  sector: "Technology",
  industry: "Cybersecurity",
  logo_url: null,
  price: 198.42,
  previous_close: 211.2,
  day_change_pct: -6.05,
  day_change_abs: -12.78,
  volume: null,
  direction: "down",
  headline: "Growth outlook cut after soft billings guide",
  thesis: null,
  today_brief: "Analyst downgrade and slower enterprise spend cited as the main pressure.",
  news_count: 4,
  source_count: 3,
  overall_score: null,
  overall_label: null,
  catalyst: "Guidance cut",
  risk: null,
  key_points: [],
  visual_summary: {
    what_changed: "FY billings guide came in below consensus after two quarters of upside.",
    why_it_matters: "The multiple had been pricing durable re-acceleration — this print breaks that narrative.",
    what_to_watch: "Enterprise pipeline commentary",
  },
  overall_verdict: null,
  comparative_context: null,
};

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3" y="7" width="10" height="8" rx="2" stroke="#6b7280" strokeWidth="1.4" />
      <path d="M5 7V5a3 3 0 016 0v2" stroke="#6b7280" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11" r="1" fill="#6b7280" />
    </svg>
  );
}

export function FeedPaywallSlot({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 pt-8 md:pt-10">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">
        Unlock with Pro
      </p>
      {children}
    </div>
  );
}

export function FeedLockedCard({
  label,
  description = "Unlock with Pro",
  className = "",
}: {
  label: string;
  description?: string;
  className?: string;
}) {
  return (
    <Link
      href="/subscribe"
      className={`flex h-full min-h-[176px] flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed border-[#d1d5db] bg-[#f9fafb] p-4 text-center transition-colors hover:border-[#111111] hover:bg-white ${className}`}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f4f6]">
        <LockIcon />
      </div>
      <div>
        <p className="text-[13px] font-semibold text-[#111111]">{label}</p>
        <p className="mt-0.5 text-[11px] text-[#9ca3af]">{description}</p>
      </div>
    </Link>
  );
}

const GENERIC_REDDIT: RedditTicker = {
  ticker: "NVDA",
  sentiment: "bullish",
  summary:
    "Thread heat is around Blackwell demand and hyperscaler capex — crowd read is still risk-on into the next guide.",
  mention_count: 48,
  catalysts: ["Blackwell demand", "Capex cycle", "AI infra spend"],
};

export function MarketAnomaliesPaywall({
  anomalies,
  upCount,
  downCount,
}: {
  anomalies: AnomalyItem[];
  upCount: number;
  downCount: number;
}) {
  const example = anomalies[0] ?? GENERIC_ANOMALY;
  const tickers = anomalies.map((item) => item.ticker.toUpperCase());
  const total = anomalies.length;

  return (
    <ContextualFeedPaywallShell
      surface="market_anomalies"
      theme={THEMES.anomaly}
      title="See why every mover is acting up"
      description={`See the full read on what changed and why each stock moved. Pro unlocks ${PRO_LOCKED_FEED_TEASER} more movers.`}
      benefits={ANOMALY_BENEFITS}
      tickerPills={{ label: "Moving today", tickers }}
      exampleTitle="Example anomaly card"
      exampleCaption="Every mover gets a headline, brief, and context — not just the percentage change."
      exampleCard={<AnomalyExampleCard item={example} />}
    />
  );
}

export function RedditBuzzPaywall({
  tickers,
  postCount,
  bullCount,
  bearCount,
  neutralCount = 0,
}: {
  tickers: RedditTicker[];
  postCount: number;
  bullCount: number;
  bearCount: number;
  neutralCount?: number;
}) {
  const example = tickers[0] ?? GENERIC_REDDIT;
  const tickerList = tickers.map((item) => item.ticker.toUpperCase());
  const moodSummary =
    neutralCount > 0
      ? `${bullCount} bullish, ${neutralCount} neutral, ${bearCount} bearish`
      : `${bullCount} bullish, ${bearCount} bearish`;

  return (
    <ContextualFeedPaywallShell
      surface="reddit_buzz"
      theme={THEMES.reddit}
      title="Read the crowd, not just the tickers"
      description={`${postCount} posts scanned · ${moodSummary}. Pro unlocks ${PRO_LOCKED_FEED_TEASER} buzzing names with narrative summaries and catalyst themes.`}
      benefits={REDDIT_BENEFITS}
      tickerPills={{ label: "Buzzing on Reddit", tickers: tickerList }}
      exampleTitle="Example buzz card"
      exampleCaption="Every name gets sentiment, mention heat, and what the crowd is actually debating."
      exampleCard={<RedditExampleCard item={example} />}
    />
  );
}
