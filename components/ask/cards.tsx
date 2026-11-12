"use client";

import * as React from "react";

import { Delta, FOCUS, NUM, SourceLine, Tag, TickerLink, fmtAgo, fmtCompact, fmtDay, fmtMoney, toneText } from "@/components/ask/atoms";
import { LineChart } from "@/components/ask/line-chart";
import { OaButton } from "@/components/oa/button";
import { StockLogo } from "@/components/stock-logo";
import { MarkSlot, ToneGlyph, Verdict } from "@/components/oa/kit/tone";
import type {
  ActionCard,
  AgentsCard,
  AskCard,
  BriefingItemCard,
  MemoCard,
  MemoLine,
  ReasonsCard,
  ResearchCard,
  ResearchListCard,
  WatchCard,
  BacktestCard,
  BasketCard,
  ChangesCard,
  CompareCard,
  CongressCard,
  EarningsCard,
  FundCard,
  InsidersCard,
  InvestorsCard,
  MarketBriefCard,
  MarketsCard,
  MoverRow,
  NewsCard,
  PortfolioCard,
  QuoteCard,
  ReturnsCard,
  ScreensCard,
  ThemesCard,
  WebCard,
} from "@/lib/ask-cards";
import { beatShare, markFor, priceVsTarget, rsiWord, scoreVerdict, type Tone } from "@/lib/tone";
import { WATCH_HOW_WORDS, WATCH_WHEN_PLAIN, saveOutcome, watchWhenWords, type SaveResponse, type SaveState } from "@/lib/ask-answer";
import { lockCopy } from "@/lib/entitlements";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";

/**
 * How each tool result is drawn in the conversation. One card per result,
 * each ending in the source and the time the data is from.
 */

export type CardActions = {
  signedIn: boolean;
  /** Send a follow-up question as the person. */
  ask: (question: string) => void;
  signIn: () => void;
};

/* ── frame ──────────────────────────────────────────────────────────────── */

function Frame({ label, right, children, source, flush = false }: { label: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; source?: React.ReactNode; flush?: boolean }) {
  return (
    <section className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card">
      <div className="flex min-h-9 items-center justify-between gap-3 border-b border-oa-border px-3.5 py-1.5">
        <h3 className="oa-caption min-w-0 truncate">{label}</h3>
        {right ? <div className="flex shrink-0 items-center gap-2 text-[12.5px] text-oa-muted-fg">{right}</div> : null}
      </div>
      <div className={flush ? "" : "p-3.5"}>{children}</div>
      {source ? <div className="border-t border-oa-border bg-oa-bg px-3.5 py-1.5">{source}</div> : null}
    </section>
  );
}

/** Good or bad beside a figure that is not a signed change. Neutral gets nothing: a gray mark beside a number reads as a minus. */
function Mark({ tone }: { tone: Tone | null | undefined }) {
  return tone === "up" || tone === "down" ? <ToneGlyph tone={tone} /> : null;
}

function Stat({ label, children, sub, mark }: { label: string; children: React.ReactNode; sub?: React.ReactNode; mark?: Tone | null }) {
  return (
    <div className="min-w-0">
      <dt className="oa-caption">{label}</dt>
      <dd className={`${NUM} mt-0.5 flex min-w-0 items-center gap-1.5 text-[14.5px] font-medium text-oa-fg`}>
        <span className="truncate">{children}</span>
        <Mark tone={mark} />
      </dd>
      {sub ? <dd className="mt-0.5 truncate text-[12px] text-oa-muted-fg">{sub}</dd> : null}
    </div>
  );
}

function Th({ children, right = false, hideOnMobile = false }: { children?: React.ReactNode; right?: boolean; hideOnMobile?: boolean }) {
  return (
    <th scope="col" className={`oa-caption whitespace-nowrap border-b border-oa-border bg-oa-bg px-2.5 py-1.5 first:pl-3.5 last:pr-3.5 ${right ? "text-right" : "text-left"} ${hideOnMobile ? "hidden sm:table-cell" : ""}`}>
      {children}
    </th>
  );
}

function Td({ children, right = false, hideOnMobile = false, wrap = false, className = "" }: { children?: React.ReactNode; right?: boolean; hideOnMobile?: boolean; wrap?: boolean; className?: string }) {
  return (
    <td className={`h-9 px-2.5 py-1.5 align-middle text-[13.5px] first:pl-3.5 last:pr-3.5 ${wrap ? "" : "whitespace-nowrap"} ${right ? `text-right ${NUM}` : "text-left"} ${hideOnMobile ? "hidden sm:table-cell" : ""} ${className}`}>
      {children}
    </td>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}

const ROW = "border-b border-oa-border last:border-b-0";
/** About eight rows, then the list scrolls inside with no visible bar (owner rule for every long list). */
const SCROLL_8 = "scrollbar-hide max-h-[22rem] overflow-y-auto";
const na = <span className="text-oa-muted-fg">n/a</span>;

function ratio(value: number | null, suffix = "x") {
  return value === null ? na : `${value.toFixed(1)}${suffix}`;
}

/**
 * A worst fall in normal ink with its size judged beside it. Always negative, so a red number
 * would say nothing; the glyph says whether the fall was mild or deep.
 */
function Fall({ value, digits = 2 }: { value: number | null | undefined; digits?: number }) {
  if (value == null || !Number.isFinite(value)) return na;
  return (
    <span className={`${NUM} inline-flex items-center gap-1.5 text-oa-fg`}>
      {value < 0 ? "−" : ""}
      {Math.abs(value).toFixed(digits)}%
      {/* A fixed slot, so a fall with no mark still lines up with one that has it in a right-aligned column. */}
      <MarkSlot tone={markFor("drawdown", value)} />
    </span>
  );
}

/** The scoring model's word ("strong", "weak") as a verdict chip; a word we cannot judge stays a plain tag. */
function ScoreWord({ word }: { word: string }) {
  const tone = scoreVerdict(word);
  const text = word.charAt(0).toUpperCase() + word.slice(1);
  return tone ? <Verdict tone={tone}>{text}</Verdict> : <Tag>{text}</Tag>;
}

function bracket(low: number | null, high: number | null): string {
  if (low === null) return "";
  if (high === null || high < low) return `over ${fmtCompact(low, "$")}`;
  return `${fmtCompact(low, "$")} to ${fmtCompact(high, "$")}`;
}

const TIME_WORDS: Record<string, string> = { bmo: "before the open", amc: "after the close", during: "during the session" };

/* ── stock ──────────────────────────────────────────────────────────────── */

/** Only a stretched RSI gets a word, in neutral: overbought and oversold are traders' warnings, not a verdict on the company. */
function rsiNote(rsi: number | null): React.ReactNode {
  const read = rsiWord(rsi);
  return read && read.word !== "Normal" ? <Verdict tone={read.tone}>{read.word}</Verdict> : undefined;
}

function Quote({ card }: { card: QuoteCard }) {
  return (
    <Frame
      label={
        <>
          <Link prefetch={false} href={`/stock/${encodeURIComponent(card.ticker)}`} className="inline-flex items-center gap-1.5 align-middle text-oa-fg hover:underline">
            <StockLogo ticker={card.ticker} size={16} />
            {card.ticker}
          </Link>
          {card.name ? <span className="ml-2 normal-case tracking-normal text-oa-muted-fg">{card.name}</span> : null}
        </>
      }
      right={card.verdict ? <ScoreWord word={card.verdict} /> : null}
      source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`${NUM} text-[26px] font-medium leading-none text-oa-fg`}>{card.price === null ? "No price" : fmtMoney(card.price)}</span>
        {card.day_change_pct !== null ? <Delta value={card.day_change_pct} className="text-[15px]" /> : null}
        {card.sector ? <span className="text-[13px] text-oa-muted-fg">{[card.sector, card.industry].filter(Boolean).join(" · ")}</span> : null}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 [.oa-ask-panel_&]:grid-cols-2">
        <Stat label="Market value">{fmtCompact(card.market_cap, "$")}</Stat>
        <Stat label="P/E, trailing">{ratio(card.pe_ttm)}</Stat>
        <Stat label="52-week range">
          {card.week_52_low !== null && card.week_52_high !== null ? `${fmtMoney(card.week_52_low, 0)} to ${fmtMoney(card.week_52_high, 0)}` : na}
        </Stat>
        {/* Same read as the stock page: the mark says whether the price sits below or above the target, the gap stays plain. */}
        <Stat
          label="Analyst target"
          mark={priceVsTarget(card.target_upside_pct)?.tone}
          sub={card.target_upside_pct !== null ? `${card.target_upside_pct > 0 ? "+" : card.target_upside_pct < 0 ? "−" : ""}${Math.abs(card.target_upside_pct).toFixed(1)}% vs price` : undefined}
        >
          {card.analyst_target === null ? na : fmtMoney(card.analyst_target)}
        </Stat>
        <Stat label="Revenue growth" mark={markFor("revenueGrowth", card.revenue_growth_yoy_pct)}>
          {card.revenue_growth_yoy_pct === null ? na : `${card.revenue_growth_yoy_pct > 0 ? "+" : card.revenue_growth_yoy_pct < 0 ? "−" : ""}${Math.abs(card.revenue_growth_yoy_pct).toFixed(1)}% y/y`}
        </Stat>
        <Stat label="RSI, 14 day" sub={rsiNote(card.rsi_14)}>
          {card.rsi_14 === null ? na : card.rsi_14}
        </Stat>
        <Stat label="Our score" mark={markFor("score", card.score)}>
          {card.score === null ? na : `${card.score} of 100`}
        </Stat>
        <Stat label="Next report" sub={card.next_earnings?.time ? TIME_WORDS[card.next_earnings.time] : undefined}>
          {card.next_earnings ? fmtDay(card.next_earnings.date, true) : <span className="text-oa-muted-fg">No date yet</span>}
        </Stat>
      </dl>
      {card.headline ? <p className="mt-3 border-t border-oa-border pt-3 text-pretty text-[14.5px] font-medium leading-5 text-oa-fg">{card.headline}</p> : null}
      {card.thesis && card.thesis !== card.headline ? <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{card.thesis}</p> : null}
      {!card.headline && card.research_status !== "ready" ? (
        <p className="mt-3 border-t border-oa-border pt-3 text-[13.5px] text-oa-muted-fg">We have market data for this stock but no written research yet.</p>
      ) : null}
    </Frame>
  );
}

function Returns({ card }: { card: ReturnsCard }) {
  return (
    <Frame
      label={
        <>
          <span className="inline-flex items-center gap-1.5 align-middle text-oa-fg">
            <StockLogo ticker={card.ticker} size={16} />
            {card.ticker}
          </span>
          <span className="ml-2 normal-case tracking-normal text-oa-muted-fg">{card.period}</span>
        </>
      }
      source={<SourceLine source={card.source} asOf={card.as_of} />}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 [.oa-ask-panel_&]:grid-cols-2">
        <Stat label="Total return" sub={`${fmtMoney(card.from.close)} to ${fmtMoney(card.to.close)}`}>
          <Delta value={card.return_pct} />
        </Stat>
        <Stat label={card.benchmark ? `${card.benchmark.ticker}, same dates` : "Per year"}>
          {card.benchmark ? <Delta value={card.benchmark.return_pct} /> : card.annualized_pct === null ? na : <Delta value={card.annualized_pct} />}
        </Stat>
        <Stat label="Worst fall" sub="from a high in the period">
          <Fall value={card.max_drawdown_pct} />
        </Stat>
        <Stat label="Range" sub={`low ${fmtDay(card.low.date)}, high ${fmtDay(card.high.date)}`}>
          {fmtMoney(card.low.close, 0)} to {fmtMoney(card.high.close, 0)}
        </Stat>
      </dl>
      <div className="mt-3">
        <LineChart
          dates={card.points.map((point) => point.date)}
          series={[{ name: `${card.ticker} close`, values: card.points.map((point) => point.close) }]}
          format={(value) => `$${value >= 1000 ? value.toFixed(0) : value.toFixed(value >= 100 ? 0 : 2)}`}
          label={`${card.ticker} daily closes from ${card.from.date} to ${card.to.date}`}
        />
      </div>
    </Frame>
  );
}

function Compare({ card }: { card: CompareCard }) {
  return (
    <Frame label="Side by side" source={<SourceLine source={card.source} asOf={card.as_of} note={card.missing.length > 0 ? `Not found: ${card.missing.join(", ")}` : undefined} />} flush>
      <Table>
        <thead>
          <tr>
            <Th>Stock</Th>
            <Th right>Price</Th>
            <Th right>Today</Th>
            <Th right hideOnMobile>
              Mkt value
            </Th>
            <Th right>P/E</Th>
            <Th right hideOnMobile>
              Target
            </Th>
            <Th right hideOnMobile>
              3M
            </Th>
            <Th right>1Y</Th>
            <Th right hideOnMobile>
              Score
            </Th>
          </tr>
        </thead>
        <tbody>
          {card.rows.map((row) => (
            <tr key={row.ticker} className={ROW}>
              <Td>
                {/* Nine columns leave no room for the company name; it is on hover and one click away. */}
                <span title={row.name}>
                  <TickerLink symbol={row.ticker} />
                </span>
              </Td>
              <Td right>{fmtMoney(row.price)}</Td>
              <Td right>
                <Delta value={row.day_change_pct} />
              </Td>
              <Td right hideOnMobile>
                {fmtCompact(row.market_cap, "$")}
              </Td>
              <Td right>{ratio(row.pe_ttm)}</Td>
              <Td right hideOnMobile>
                {row.analyst_target === null ? na : fmtMoney(row.analyst_target, 0)}
              </Td>
              <Td right hideOnMobile>
                <Delta value={row.r_3m} digits={1} />
              </Td>
              <Td right>
                <Delta value={row.r_1y} digits={1} />
              </Td>
              <Td right hideOnMobile>
                {row.score === null ? (
                  na
                ) : (
                  <span className="inline-flex items-center justify-end gap-1">
                    {row.score}
                    <MarkSlot tone={markFor("score", row.score)} />
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Frame>
  );
}

/* ── the person's names ─────────────────────────────────────────────────── */

function Portfolio({ card }: { card: PortfolioCard }) {
  if (card.rows.length === 0) {
    return (
      <Frame label="Your portfolio" source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />}>
        <p className="text-[14px] text-oa-muted-fg">You are not tracking anything yet. Add a stock from its page and it will show up here.</p>
      </Frame>
    );
  }
  const hasWeights = card.rows.some((row) => row.weight_pct !== null);
  const hasShares = card.rows.some((row) => row.shares != null);
  const hasCost = card.rows.some((row) => row.avg_cost != null);
  return (
    <Frame
      label={card.example ? "The example portfolio" : "Your portfolio"}
      right={<span className={NUM}>{card.tracked} names</span>}
      source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />}
      flush
    >
      {card.example ? <p className="border-b border-oa-border px-3.5 py-2 text-[13px] leading-5 text-oa-muted-fg">These are made-up holdings priced with real quotes, not yours.</p> : null}
      <div className={SCROLL_8}>
      <Table>
        <thead>
          <tr>
            <Th>Stock</Th>
            {hasShares ? (
              <Th right hideOnMobile>
                Shares
              </Th>
            ) : null}
            {hasCost ? (
              <Th right hideOnMobile>
                Avg cost
              </Th>
            ) : null}
            <Th right>Price</Th>
            <Th right>Today</Th>
            {hasWeights ? (
              <Th right hideOnMobile>
                Weight
              </Th>
            ) : null}
            {hasWeights ? <Th right>Gain</Th> : null}
            <Th hideOnMobile>Note</Th>
          </tr>
        </thead>
        <tbody>
          {card.rows.slice(0, 20).map((row) => (
            <tr key={row.ticker} className={ROW}>
              <Td>
                <TickerLink symbol={row.ticker} />
                <Tag className="ml-2" tone={row.position === "holding" ? "primary" : "neutral"}>
                  {row.position === "holding" ? "Held" : "Watching"}
                </Tag>
              </Td>
              {hasShares ? (
                <Td right hideOnMobile>
                  {row.shares == null ? "" : row.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                </Td>
              ) : null}
              {hasCost ? (
                <Td right hideOnMobile>
                  {row.avg_cost == null ? "" : fmtMoney(row.avg_cost)}
                </Td>
              ) : null}
              <Td right>{fmtMoney(row.price)}</Td>
              <Td right>
                <Delta value={row.day_change_pct} />
              </Td>
              {hasWeights ? (
                <Td right hideOnMobile>
                  {row.weight_pct === null ? "" : `${row.weight_pct.toFixed(1)}%`}
                </Td>
              ) : null}
              {hasWeights ? <Td right>{row.gain_pct === null ? "" : <Delta value={row.gain_pct} digits={1} />}</Td> : null}
              <Td hideOnMobile wrap className="max-w-[22rem] text-[13px] text-oa-muted-fg">
                {row.call ?? row.note ?? ""}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      </div>
      {card.rows.length > 20 ? <p className="border-t border-oa-border px-3.5 py-2 text-[12.5px] text-oa-muted-fg">Showing 20 of {card.rows.length}. The rest are on your portfolio page.</p> : null}
    </Frame>
  );
}

function Changes({ card }: { card: ChangesCard }) {
  return (
    <Frame label="What changed for you" source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />}>
      <p className="text-pretty text-[14.5px] font-medium leading-5 text-oa-fg">{card.headline}</p>
      {card.body ? <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{card.body}</p> : null}
      {card.items.length > 0 ? (
        <ul className="mt-3 divide-y divide-oa-border border-t border-oa-border">
          {card.items.map((item, index) => (
            <li key={index} className="flex gap-3 py-2 text-[13.5px] leading-5">
              <span className="w-[5rem] shrink-0">{item.ticker ? <TickerLink symbol={item.ticker} /> : null}</span>
              <span className="min-w-0">
                <span className="text-oa-fg">{item.title}</span>
                {item.detail ? <span className="block text-oa-muted-fg">{item.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {card.upcoming.length > 0 ? (
        <p className="mt-3 text-[13px] text-oa-muted-fg">
          Coming up: {card.upcoming.map((item) => [item.ticker, item.title, item.date ? fmtDay(item.date) : ""].filter(Boolean).join(" ")).join(" · ")}
        </p>
      ) : null}
    </Frame>
  );
}

/* ── market ─────────────────────────────────────────────────────────────── */

function Movers({ title, rows }: { title: string; rows: MoverRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="min-w-0">
      <p className="oa-caption mb-1">{title}</p>
      <ul className="divide-y divide-oa-border">
        {rows.map((row) => (
          <li key={row.ticker} className="py-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">
                <TickerLink symbol={row.ticker} />
                <span className="ml-2 text-[13px] text-oa-muted-fg">{row.name}</span>
              </span>
              <Delta value={row.day_change_pct} className="text-[13.5px]" />
            </div>
            {row.reason ? <p className="mt-0.5 text-pretty text-[12.5px] leading-4 text-oa-muted-fg">{row.reason}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MarketBrief({ card }: { card: MarketBriefCard }) {
  return (
    <Frame label="The market today" source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />}>
      {card.title ? <p className="text-pretty text-[15px] font-medium leading-5 text-oa-fg">{card.title}</p> : null}
      {card.body ? <p className="mt-1 line-clamp-4 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{card.body}</p> : null}
      {card.macro.length > 0 ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-oa-border pt-3 sm:grid-cols-4 [.oa-ask-panel_&]:grid-cols-2">
          {card.macro.map((item) => (
            <Stat key={item.label} label={item.label} sub={<Delta value={item.day_change_pct} className="text-[12px]" />}>
              {item.value}
            </Stat>
          ))}
        </dl>
      ) : null}
      <div className="mt-3 grid gap-4 border-t border-oa-border pt-3 sm:grid-cols-2">
        <Movers title="Up most" rows={card.gainers} />
        <Movers title="Down most" rows={card.losers} />
      </div>
    </Frame>
  );
}

function Screens({ card }: { card: ScreensCard }) {
  return (
    <Frame label="Live screens" source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />} flush>
      <ul className="divide-y divide-oa-border">
        {card.screens.map((screen) => (
          <li key={screen.id} className="px-3.5 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <Link prefetch={false} href={`/screens/${screen.id}`} className={`text-[14px] font-medium text-oa-fg hover:underline ${FOCUS}`}>
                {screen.title}
              </Link>
              <span className={`${NUM} shrink-0 text-[12.5px] text-oa-muted-fg`}>
                {screen.match_count} {screen.match_count === 1 ? "match" : "matches"}
              </span>
            </div>
            <p className="text-[13px] leading-5 text-oa-muted-fg">{screen.tagline}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {screen.top.map((row) => (
                <span key={row.ticker} className="inline-flex items-center gap-1.5">
                  <TickerLink symbol={row.ticker} logo={14} className="!text-[12.5px]" />
                  <Delta value={row.day_change_pct} className="text-[12px]" />
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function Themes({ card }: { card: ThemesCard }) {
  return (
    <Frame label="Research themes" source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />} flush>
      <ul className="divide-y divide-oa-border">
        {card.themes.map((theme) => (
          <li key={theme.slug} className="px-3.5 py-2.5">
            <Link prefetch={false} href={`/themes/${theme.slug}`} className={`text-[14px] font-medium text-oa-fg hover:underline ${FOCUS}`}>
              {theme.name}
            </Link>
            <p className="text-[13px] leading-5 text-oa-muted-fg">{theme.description}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {theme.names.map((name) => (
                <span key={name.ticker} className="inline-flex items-center gap-1.5 text-[12.5px] text-oa-muted-fg">
                  <TickerLink symbol={name.ticker} logo={14} className="!text-[12.5px]" />
                  {name.role}
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function News({ card }: { card: NewsCard }) {
  return (
    <Frame label={card.ticker ? `Headlines naming ${card.ticker}` : "From the wire"} source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />} flush>
      {card.articles.length === 0 ? (
        <p className="px-3.5 py-3 text-[13.5px] text-oa-muted-fg">No recent headlines{card.ticker ? ` name ${card.ticker}` : ""}.</p>
      ) : (
        <ul className="divide-y divide-oa-border">
          {card.articles.map((article) => (
            <li key={article.url} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 px-3.5 py-2">
              <span className={`${NUM} pt-0.5 text-[11.5px] text-oa-muted-fg`}>{fmtAgo(article.published_at)}</span>
              <span className="min-w-0">
                <a href={article.url} target="_blank" rel="noopener noreferrer" className={`text-pretty text-[13.5px] font-medium leading-5 text-oa-fg hover:underline ${FOCUS}`}>
                  {article.title}
                </a>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-oa-muted-fg">
                  {article.source}
                  {article.tickers.slice(0, 4).map((ticker) => (
                    <TickerLink key={ticker} symbol={ticker} logo={14} className="!text-[12px]" />
                  ))}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

function Web({ card }: { card: WebCard }) {
  return (
    <Frame label="From the web" right={<span className="max-w-[16rem] truncate">{card.query}</span>} source={<SourceLine source={card.source} asOf={card.as_of} />} flush>
      <ul className="divide-y divide-oa-border">
        {card.results.map((result) => {
          let host = "";
          try {
            host = new URL(result.url).hostname.replace(/^www\./, "");
          } catch {
            host = "";
          }
          return (
            <li key={result.url} className="px-3.5 py-2">
              <a href={result.url} target="_blank" rel="noopener noreferrer" className={`text-[13.5px] font-medium leading-5 text-oa-fg hover:underline ${FOCUS}`}>
                {result.title}
              </a>
              <p className="line-clamp-2 text-[12.5px] leading-4 text-oa-muted-fg">{result.snippet}</p>
              <p className={`${NUM} text-[11.5px] text-oa-muted-fg`}>{host}</p>
            </li>
          );
        })}
      </ul>
    </Frame>
  );
}

function Earnings({ card }: { card: EarningsCard }) {
  return (
    <Frame label="Earnings dates" right={card.scope} source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />} flush>
      {card.events.length === 0 ? (
        <p className="px-3.5 py-3 text-[13.5px] text-oa-muted-fg">No report is scheduled in our calendar for that.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Stock</Th>
              <Th hideOnMobile>When</Th>
              <Th right>EPS estimate</Th>
            </tr>
          </thead>
          <tbody>
            {card.events.slice(0, 16).map((event) => (
              <tr key={`${event.ticker}-${event.date}`} className={ROW}>
                <Td className={NUM}>{fmtDay(event.date, true)}</Td>
                <Td>
                  <TickerLink symbol={event.ticker} />
                  <span className="ml-2 hidden text-oa-muted-fg sm:inline">{event.company}</span>
                </Td>
                <Td hideOnMobile className="text-oa-muted-fg">
                  {event.time ? TIME_WORDS[event.time] : ""}
                </Td>
                <Td right>{event.eps_estimate === null ? na : fmtMoney(event.eps_estimate)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {card.events.length > 16 ? <p className="border-t border-oa-border px-3.5 py-2 text-[12.5px] text-oa-muted-fg">Showing 16 of {card.events.length}. The calendar has the rest.</p> : null}
    </Frame>
  );
}

/* ── backtest ───────────────────────────────────────────────────────────── */

function Backtest({ card }: { card: BacktestCard }) {
  const [open, setOpen] = React.useState(false);
  const rows: Array<{ label: string; mine: React.ReactNode; theirs: React.ReactNode }> = [
    { label: "Total return", mine: <Delta value={card.strategy.total_return_pct} digits={1} />, theirs: <Delta value={card.benchmark_stats.total_return_pct} digits={1} /> },
    { label: "Per year", mine: <Delta value={card.strategy.annualized_pct} digits={1} />, theirs: <Delta value={card.benchmark_stats.annualized_pct} digits={1} /> },
    { label: "Worst fall", mine: <Fall value={card.strategy.max_drawdown_pct} digits={1} />, theirs: <Fall value={card.benchmark_stats.max_drawdown_pct} digits={1} /> },
    {
      label: "Volatility",
      mine: card.strategy.volatility_pct === null ? na : `${card.strategy.volatility_pct.toFixed(1)}%`,
      theirs: card.benchmark_stats.volatility_pct === null ? na : `${card.benchmark_stats.volatility_pct.toFixed(1)}%`,
    },
  ];
  return (
    <Frame
      label="Backtest"
      right={
        <>
          <Tag tone="warn">Simulated</Tag>
          <span className={NUM}>
            {fmtDay(card.start, true)} to {fmtDay(card.end, true)}
          </span>
        </>
      }
      source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} note={`${card.cost_bps} bps per trade`} />}
    >
      <p className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-oa-muted-fg">
        {card.holdings.map((holding) => (
          <span key={holding.ticker} className="inline-flex items-baseline gap-1.5">
            <TickerLink symbol={holding.ticker} logo={14} className="!text-[13px]" />
            <span className={NUM}>{holding.weight_pct.toFixed(holding.weight_pct % 1 === 0 ? 0 : 1)}%</span>
          </span>
        ))}
        <span>rebalanced {card.rebalance === "never" ? "never" : card.rebalance}</span>
      </p>
      <LineChart
        dates={card.curve.map((point) => point.date)}
        series={[
          { name: "This mix", values: card.curve.map((point) => point.strategy) },
          { name: card.benchmark, values: card.curve.map((point) => point.benchmark) },
        ]}
        format={(value) => value.toFixed(0)}
        label={`Growth of 100 in this mix against ${card.benchmark}, ${card.start} to ${card.end}`}
      />
      <p className="mt-1 text-[12px] text-oa-muted-fg">Growth of 100 put in on the start date.</p>
      <div className="mt-3 overflow-x-auto border-t border-oa-border pt-1">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="py-1.5 text-left" />
              <th className="oa-caption px-2 py-1.5 text-right">This mix</th>
              <th className="oa-caption py-1.5 pl-2 text-right">{card.benchmark}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-oa-border">
                <td className="py-1.5 text-[13.5px] text-oa-muted-fg">{row.label}</td>
                <td className={`${NUM} px-2 py-1.5 text-right text-[13.5px] font-medium`}>{row.mine}</td>
                <td className={`${NUM} py-1.5 pl-2 text-right text-[13.5px]`}>{row.theirs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[13px] leading-5 text-oa-muted-fg">
        Beat {card.benchmark} in{" "}
        <span className="inline-flex items-center gap-1 text-oa-fg">
          {card.beat_years.beat} of {card.beat_years.of}
          <Mark tone={beatShare(card.beat_years.beat, card.beat_years.of)} />
        </span>{" "}
        full years.
        {card.best_year ? ` Best year ${card.best_year.year}.` : ""}
        {card.worst_year ? ` Worst year ${card.worst_year.year}.` : ""}
        {card.limited_by ? ` Starts ${fmtDay(card.start, true)} because ${card.limited_by.ticker} has no earlier prices.` : ""}
      </p>
      {card.caveats.length > 0 ? (
        <div className="mt-2 border-t border-oa-border pt-2">
          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className={`text-[13px] font-medium text-oa-fg underline decoration-oa-border underline-offset-2 ${FOCUS}`}>
            {open ? "Hide" : "Read"} the {card.caveats.length} {card.caveats.length === 1 ? "thing" : "things"} this test cannot tell you
          </button>
          {open ? (
            <ul className="mt-2 space-y-2">
              {card.caveats.map((caveat) => (
                <li key={caveat.title} className="text-[13px] leading-5">
                  <span className="font-medium text-oa-fg">{caveat.title}. </span>
                  <span className="text-oa-muted-fg">{caveat.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] leading-5 text-oa-muted-fg">{card.caveats[0]!.text}</p>
          )}
        </div>
      ) : null}
    </Frame>
  );
}

/* ── investors ──────────────────────────────────────────────────────────── */

function Fund({ card }: { card: FundCard }) {
  return (
    <Frame
      label={
        <>
          <Link prefetch={false} href={`/follow/${card.slug}`} className="text-oa-fg hover:underline">
            {card.manager}
          </Link>
          <span className="ml-2 normal-case tracking-normal text-oa-muted-fg">{card.fund}</span>
        </>
      }
      right={<Tag>13F · {card.quarter}</Tag>}
      source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} note={card.lag_days !== null ? `filed ${card.lag_days} days after quarter end` : undefined} />}
      flush
    >
      {card.record || card.stock_value !== null ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-oa-border p-3.5 sm:grid-cols-4 [.oa-ask-panel_&]:grid-cols-2">
          <Stat label="Reported stocks">{fmtCompact(card.stock_value, "$")}</Stat>
          <Stat label="Positions">{card.positions_count ?? na}</Stat>
          {card.record ? (
            <>
              <Stat label={`Since ${fmtDay(card.record.since, true)}`} sub={card.record.spy_return_pct !== null ? <>S&amp;P 500 <Delta value={card.record.spy_return_pct} digits={1} className="text-[12px]" /></> : undefined}>
                <Delta value={card.record.fund_return_pct} digits={1} />
              </Stat>
              <Stat label="Worst fall">
                <Fall value={card.record.max_drawdown_pct} digits={1} />
              </Stat>
            </>
          ) : null}
        </dl>
      ) : null}
      <Table>
        <thead>
          <tr>
            <Th>Holding</Th>
            <Th right>Weight</Th>
            <Th right hideOnMobile>
              Value
            </Th>
            <Th right>Vs prior quarter</Th>
          </tr>
        </thead>
        <tbody>
          {card.positions.map((row, index) => (
            <tr key={`${row.ticker ?? row.name}-${index}`} className={ROW}>
              <Td>
                {row.ticker ? <TickerLink symbol={row.ticker} /> : null}
                <span className={`${row.ticker ? "ml-2 hidden sm:inline" : ""} text-oa-muted-fg`}>{row.name}</span>
              </Td>
              <Td right>{row.weight_pct === null ? na : `${row.weight_pct.toFixed(1)}%`}</Td>
              <Td right hideOnMobile>
                {fmtCompact(row.value, "$")}
              </Td>
              <Td right>
                {row.change === "new" ? (
                  <Tag tone="up">New</Tag>
                ) : row.shares_delta_pct !== null && row.shares_delta_pct !== 0 ? (
                  <Delta value={row.shares_delta_pct} digits={Math.abs(row.shares_delta_pct) >= 100 ? 0 : 1} suffix="% shares" />
                ) : (
                  <span className="text-oa-muted-fg">No change</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {card.bought.length > 0 || card.sold.length > 0 ? (
        <div className="grid gap-3 border-t border-oa-border p-3.5 text-[13px] leading-5 sm:grid-cols-2">
          <p>
            <span className="oa-caption mr-2">Bought</span>
            {card.bought.length === 0
              ? "Nothing new or added."
              : card.bought.map((row) => `${row.ticker ?? row.name}${row.kind === "new" ? " (new)" : ""}`).join(", ")}
          </p>
          <p>
            <span className="oa-caption mr-2">Sold</span>
            {card.sold.length === 0 ? "Nothing cut or sold." : card.sold.map((row) => `${row.ticker ?? row.name}${row.kind === "sold" ? " (out)" : ""}`).join(", ")}
          </p>
        </div>
      ) : null}
    </Frame>
  );
}

function Investors({ card }: { card: InvestorsCard }) {
  return (
    <Frame label="Investors we follow" source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />} flush>
      <ul className="divide-y divide-oa-border">
        {card.investors.slice(0, 14).map((investor) => (
          <li key={investor.slug} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 px-3.5 py-2">
            <span className={`${NUM} pt-0.5 text-[11.5px] text-oa-muted-fg`}>{fmtDay(investor.latest_date)}</span>
            <span className="min-w-0">
              <Link prefetch={false} href={`/follow/${investor.slug}`} className={`text-[13.5px] font-medium text-oa-fg hover:underline ${FOCUS}`}>
                {investor.name}
              </Link>
              <Tag className="ml-2">{investor.kind === "fund" ? "13F" : "Congress"}</Tag>
              <span className="block truncate text-[12.5px] text-oa-muted-fg">{investor.headline}</span>
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function Congress({ card }: { card: CongressCard }) {
  return (
    <Frame label="Congressional trades" right={<span className="max-w-[18rem] truncate">{card.scope}</span>} source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />} flush>
      {card.trades.length === 0 ? (
        <p className="px-3.5 py-3 text-[13.5px] text-oa-muted-fg">No disclosed trades match.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Disclosed</Th>
              <Th>Member</Th>
              <Th>Trade</Th>
              <Th right>Amount</Th>
              <Th right hideOnMobile>
                Traded
              </Th>
            </tr>
          </thead>
          <tbody>
            {card.trades.map((trade, index) => {
              const buy = /buy|purchase/i.test(trade.side);
              return (
                <tr key={index} className={ROW}>
                  <Td className={NUM}>{fmtDay(trade.disclosed)}</Td>
                  <Td>
                    {trade.url ? (
                      <a href={trade.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {trade.person}
                      </a>
                    ) : (
                      trade.person
                    )}
                    {trade.party ? <span className="ml-1.5 text-oa-muted-fg">({trade.party[0]})</span> : null}
                  </Td>
                  <Td>
                    <span className={buy ? toneText("up") : toneText("down")}>{buy ? "Bought" : "Sold"}</span> <TickerLink symbol={trade.ticker} />
                  </Td>
                  <Td right>{bracket(trade.amount_low, trade.amount_high)}</Td>
                  <Td right hideOnMobile>
                    {fmtDay(trade.traded)}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Frame>
  );
}

function Insiders({ card }: { card: InsidersCard }) {
  return (
    <Frame label="Insider trades" right={<span className="max-w-[18rem] truncate">{card.scope}</span>} source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />} flush>
      {card.trades.length === 0 ? (
        <p className="px-3.5 py-3 text-[13.5px] text-oa-muted-fg">No Form 4 trades match.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Filed</Th>
              <Th>Stock</Th>
              <Th>Insider</Th>
              <Th>Trade</Th>
              <Th right>Value</Th>
            </tr>
          </thead>
          <tbody>
            {card.trades.slice(0, 12).map((trade, index) => (
              <tr key={index} className={ROW}>
                <Td className={NUM}>{fmtDay(trade.filed)}</Td>
                <Td>
                  <TickerLink symbol={trade.ticker} />
                </Td>
                <Td wrap className="max-w-[14rem]">
                  {trade.url ? (
                    <a href={trade.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {trade.insider}
                    </a>
                  ) : (
                    trade.insider
                  )}
                  <span className="block text-[12px] text-oa-muted-fg">{trade.role}</span>
                </Td>
                <Td>
                  <span className={trade.side === "buy" ? toneText("up") : toneText("down")}>{trade.side === "buy" ? "Bought" : "Sold"}</span>
                  {trade.planned ? <Tag className="ml-1.5">Planned</Tag> : null}
                </Td>
                <Td right>{fmtCompact(trade.value, "$")}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Frame>
  );
}

function Markets({ card }: { card: MarketsCard }) {
  return (
    <Frame label="Quotes" source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />} flush>
      <Table>
        <thead>
          <tr>
            <Th>Market</Th>
            <Th hideOnMobile>Kind</Th>
            <Th right>Level</Th>
            <Th right>Change</Th>
          </tr>
        </thead>
        <tbody>
          {card.assets.map((asset) => (
            <tr key={asset.id} className={ROW}>
              <Td>
                <AppLink href={asset.href} className={`font-medium text-oa-fg hover:underline ${FOCUS}`}>
                  {asset.name}
                </AppLink>
                <span className={`${NUM} ml-2 text-[12px] text-oa-muted-fg`}>{asset.symbol}</span>
              </Td>
              <Td hideOnMobile className="text-oa-muted-fg">
                {asset.kind}
              </Td>
              <Td right>{asset.level}</Td>
              <Td right>
                {asset.change ? <span className={toneText(asset.tone)}>{asset.change}</span> : na}
                <span className="ml-1.5 hidden text-[12px] text-oa-muted-fg sm:inline">{asset.change_label}</span>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Frame>
  );
}

/* ── things that need a yes ─────────────────────────────────────────────── */

type Outcome = { ticker: string; ok: boolean; message: string };
type RunState = { phase: "idle" } | { phase: "running" } | { phase: "done"; results: Outcome[] } | { phase: "failed"; message: string };

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, data };
}

function useAction() {
  const [state, setState] = React.useState<RunState>({ phase: "idle" });
  const run = React.useCallback(async (url: string, body: unknown, describe?: (data: Record<string, unknown>) => Outcome[]) => {
    setState({ phase: "running" });
    try {
      const { ok, data } = await postJson(url, body);
      const results = describe ? describe(data) : (data.results as Outcome[] | undefined);
      if (Array.isArray(results) && results.length > 0) setState({ phase: "done", results });
      else if (ok) setState({ phase: "done", results: [] });
      else setState({ phase: "failed", message: String(data.message ?? data.error ?? "That did not work. Nothing was changed.") });
    } catch {
      setState({ phase: "failed", message: "We could not reach the server. Nothing was changed." });
    }
  }, []);
  return { state, run };
}

function Results({ state }: { state: RunState }) {
  if (state.phase === "failed") return <p className="mt-2 text-[13px] text-signal-bearish">{state.message}</p>;
  if (state.phase !== "done" || state.results.length === 0) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-[13px]">
      {state.results.map((row) => (
        <li key={row.ticker + row.message} className="flex gap-2">
          <span className={`${NUM} inline-flex w-[4.75rem] shrink-0 items-center gap-1.5 font-medium ${row.ok ? "text-oa-fg" : "text-signal-bearish"}`}>
            <StockLogo ticker={row.ticker} size={14} />
            {row.ticker}
          </span>
          <span className="text-oa-muted-fg">{row.message}</span>
        </li>
      ))}
    </ul>
  );
}

function Action({ card, actions }: { card: ActionCard; actions: CardActions }) {
  const { state, run } = useAction();
  const alert = card.action === "create_price_alert";
  // Done means something was actually saved. A run where every line failed keeps the button for another try.
  const done = state.phase === "done" && state.results.some((row) => row.ok);
  return (
    <Frame label={alert ? "Set a price alert?" : "Add to your watchlist?"} right={<Tag tone={done ? "up" : "warn"}>{done ? "Done" : "Needs your yes"}</Tag>}>
      {alert ? (
        <p className="text-[14.5px] leading-6 text-oa-fg">
          Email me when <TickerLink symbol={card.tickers[0]!} logo={false} /> closes {card.condition} <span className={`${NUM} font-medium`}>{fmtMoney(card.target_price)}</span>.
          {card.last_price != null ? <span className="text-oa-muted-fg"> It last traded at {fmtMoney(card.last_price)}.</span> : null}
        </p>
      ) : (
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[14.5px] leading-6 text-oa-fg">
          {card.tickers.map((ticker) => (
            <TickerLink key={ticker} symbol={ticker} />
          ))}
        </p>
      )}
      {card.reason ? <p className="mt-1 text-[13px] leading-5 text-oa-muted-fg">{card.reason}</p> : null}
      {done ? null : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <OaButton
            size="sm"
            loading={state.phase === "running"}
            onClick={() => {
              if (!actions.signedIn) return actions.signIn();
              void run(
                "/api/ask/action",
                alert
                  ? { action: "create_price_alert", ticker: card.tickers[0], condition: card.condition, target_price: card.target_price }
                  : { action: "add_to_watchlist", tickers: card.tickers },
              );
            }}
          >
            {alert ? "Set the alert" : `Add ${card.tickers.length === 1 ? card.tickers[0] : `${card.tickers.length} names`}`}
          </OaButton>
          <span className="text-[12.5px] text-oa-muted-fg">Nothing changes until you press this.</span>
        </div>
      )}
      <Results state={state} />
    </Frame>
  );
}

const ORIGIN_TAGS: Record<string, { text: string; tone: "primary" | "neutral" | "warn" }> = {
  theme: { text: "Theme", tone: "primary" },
  screen: { text: "Screen", tone: "neutral" },
  proposed: { text: "Suggested", tone: "warn" },
};

function Basket({ card, actions }: { card: BasketCard; actions: CardActions }) {
  const save = useAction();
  const agent = useAction();
  const tickers = card.lines.map((line) => line.ticker);
  const saved = save.state.phase === "done" && save.state.results.some((row) => row.ok);
  const watching = agent.state.phase === "done" && agent.state.results.some((row) => row.ok);
  return (
    <Frame
      label="Basket"
      right={<span className={NUM}>{card.lines.length} names</span>}
      source={<SourceLine source={card.source} asOf={card.as_of} note="Reasoning is research, figures are from the store. Not a recommendation." />}
      flush
    >
      <div className="border-b border-oa-border px-3.5 py-3">
        <p className="text-balance text-[17px] font-medium leading-6 text-oa-fg">{card.title}</p>
        {card.built_from.length > 0 ? (
          <p className="mt-1 text-[13px] text-oa-muted-fg">
            Built from{" "}
            {card.built_from.map((item, index) => (
              <React.Fragment key={item.href}>
                {index > 0 ? ", " : ""}
                <AppLink href={item.href} className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
                  the {item.name} {item.kind}
                </AppLink>
              </React.Fragment>
            ))}
            .
          </p>
        ) : null}
        {card.ranked_by ? <p className="mt-1 text-[13px] text-oa-muted-fg">{card.ranked_by}</p> : null}
      </div>
      <ol className="divide-y divide-oa-border">
        {card.lines.map((line, index) => {
          const origin = ORIGIN_TAGS[line.origin]!;
          return (
            <li key={line.ticker} className="grid gap-x-4 gap-y-2 px-3.5 py-3 md:grid-cols-[minmax(0,1fr)_15rem]">
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className={`${NUM} text-[12px] text-oa-muted-fg`}>{String(index + 1).padStart(2, "0")}</span>
                  <TickerLink symbol={line.ticker} className="!text-[14.5px]" />
                  <span className="text-[14px] text-oa-fg">{line.company}</span>
                  <span title={line.origin_label}>
                    <Tag tone={origin.tone}>{origin.text}</Tag>
                  </span>
                </p>
                <dl className="mt-1.5 space-y-1.5 text-[13.5px] leading-5">
                  <div>
                    <dt className="oa-caption inline">What it does </dt>
                    <dd className="inline text-oa-muted-fg">{line.what_it_does}</dd>
                  </div>
                  <div>
                    <dt className="oa-caption inline">Why it fits </dt>
                    <dd className="inline text-oa-fg">{line.why_it_fits}</dd>
                  </div>
                  <div>
                    <dt className="oa-caption inline">Breaks if </dt>
                    <dd className="inline text-oa-muted-fg">{line.breaks_if}</dd>
                  </div>
                </dl>
              </div>
              <dl className="grid grid-cols-1 content-start gap-y-1.5 border-t border-oa-border pt-2 md:border-l md:border-t-0 md:pl-4 md:pt-0">
                {line.evidence
                  .filter((item) => item.label !== "Research note")
                  .map((item) => (
                    <div key={item.label} className="flex min-w-0 items-baseline justify-between gap-3" title={`${item.source}${item.as_of ? `, ${item.as_of.slice(0, 10)}` : ""}`}>
                      <dt className="truncate text-[12.5px] text-oa-muted-fg">{item.label}</dt>
                      <dd className={`${NUM} shrink-0 text-[13px] text-oa-fg`}>{item.value}</dd>
                    </div>
                  ))}
                {line.evidence.length === 0 ? <p className="text-[12.5px] text-oa-muted-fg">No figures on file.</p> : null}
                <p className="text-[11.5px] leading-4 text-oa-muted-fg">
                  {[...new Set(line.evidence.map((item) => item.source))].slice(0, 2).join(" · ")}
                </p>
              </dl>
            </li>
          );
        })}
      </ol>
      {card.idea_risk ? (
        <p className="border-t border-oa-border px-3.5 py-2.5 text-[13.5px] leading-5">
          <span className="oa-caption mr-2">What would break the idea</span>
          <span className="text-oa-fg">{card.idea_risk}</span>
        </p>
      ) : null}
      {card.dropped.length > 0 ? (
        <p className="border-t border-oa-border px-3.5 py-2 text-[12.5px] text-oa-muted-fg">Left out because we could not check them: {card.dropped.map((item) => item.ticker).join(", ")}.</p>
      ) : null}
      <div className="border-t border-oa-border px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <OaButton
            size="sm"
            loading={save.state.phase === "running"}
            disabled={saved}
            onClick={() => {
              if (!actions.signedIn) return actions.signIn();
              void save.run("/api/ask/action", { action: "add_to_watchlist", tickers });
            }}
          >
            {saved ? "Saved to watchlist" : "Save as watchlist"}
          </OaButton>
          <OaButton size="sm" variant="secondary" onClick={() => actions.ask(`Backtest an equal mix of ${tickers.join(", ")} against the S&P 500.`)}>
            Backtest this basket
          </OaButton>
          <OaButton
            size="sm"
            variant="secondary"
            loading={agent.state.phase === "running"}
            disabled={watching}
            onClick={() => {
              if (!actions.signedIn) return actions.signIn();
              void agent.run(
                "/api/agent-jobs",
                { template: "morning-check", name: `Watch: ${card.title}`.slice(0, 80), scope: { kind: "tickers", tickers }, trigger: {} },
                (data) =>
                  data.ok
                    ? [{ ticker: "Agent", ok: true, message: "Set. It checks these names every market day and tells you what moved, who reports and who disclosed a trade." }]
                    : [{ ticker: "Agent", ok: false, message: String(data.error ?? "Could not set up the agent.") }],
              );
            }}
          >
            {watching ? "Agent is watching" : "Set an agent to watch it"}
          </OaButton>
        </div>
        {!actions.signedIn ? <p className="mt-2 text-[12.5px] text-oa-muted-fg">Saving and agents need an account. Backtesting does not.</p> : null}
        <Results state={save.state} />
        <Results state={agent.state} />
        {watching ? (
          <Link prefetch={false} href="/agents" className="mt-1 inline-block text-[13px] font-medium text-oa-fg underline decoration-oa-border underline-offset-2">
            See its run log
          </Link>
        ) : null}
      </div>
    </Frame>
  );
}

/* ── the person's own: reasons, memo, agents, research, briefing ───────── */

const VERDICT_TONE: Record<ReasonsCard["rows"][number]["verdict"], "up" | "down" | "flat"> = { holds: "up", weaker: "down", broken: "down", played_out: "flat" };

function Reasons({ card }: { card: ReasonsCard }) {
  const source = <SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />;
  return (
    <Frame label={card.example ? "Reasons in the example portfolio" : "Your reasons"} right={<span className={NUM}>{card.rows.length} checked</span>} source={source} flush>
      {card.example ? <p className="border-b border-oa-border px-3.5 py-2 text-[13px] leading-5 text-oa-muted-fg">These reasons are made up for the example portfolio. The checks run on real data.</p> : null}
      {card.rows.length === 0 ? (
        <p className="px-3.5 py-3 text-[14px] leading-5 text-oa-muted-fg">
          {card.locked.length > 0 ? `Your plan does not check the reasons on ${card.locked.join(", ")}.` : "There is no checked reason to show yet."}
        </p>
      ) : (
        <ul className={`${SCROLL_8} divide-y divide-oa-border`}>
          {card.rows.map((row) => (
            <li key={row.ticker} className="px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <TickerLink symbol={row.ticker} />
                <Verdict tone={VERDICT_TONE[row.verdict]}>{row.verdict_words}</Verdict>
                {row.changed_from ? <span className="text-[12px] text-oa-muted-fg">Changed {fmtDay(row.changed_from.day)}</span> : null}
              </div>
              <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-fg">{row.note || row.headline}</p>
              {row.quote ? <p className="mt-0.5 text-pretty text-[12.5px] leading-5 text-oa-muted-fg">Your words: “{row.quote}”</p> : null}
            </li>
          ))}
        </ul>
      )}
      {card.rows.length > 0 && (card.locked.length > 0 || card.unchecked.length > 0) ? (
        <p className="border-t border-oa-border px-3.5 py-2 text-[12.5px] leading-5 text-oa-muted-fg">
          {card.locked.length > 0 ? `Not checked on your plan: ${card.locked.join(", ")}. ` : ""}
          {card.unchecked.length > 0 ? `No data to check: ${card.unchecked.join(", ")}.` : ""}
        </p>
      ) : null}
    </Frame>
  );
}

function MemoSection({ title, lines, focus }: { title: string; lines: MemoLine[]; focus: string | null }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="oa-caption mb-1">{title}</p>
      <ul className="divide-y divide-oa-border border-y border-oa-border">
        {lines.map((line) => (
          <li key={line.id} className={`py-2 text-pretty text-[13.5px] leading-5 ${line.id === focus ? "-mx-1.5 rounded-md bg-oa-accent px-1.5 text-oa-fg" : "text-oa-fg"}`}>
            {line.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Memo({ card }: { card: MemoCard }) {
  const range = `${fmtDay(card.monday)} to ${fmtDay(card.end_day ?? card.friday)}`;
  return (
    <Frame
      label={card.example ? "The example portfolio's week" : "Your week"}
      right={<span className={NUM}>{range}</span>}
      source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />}
    >
      {card.focus_missing ? <p className="mb-2 text-pretty text-[13px] leading-5 text-oa-muted-fg">The line you came from is no longer in this week's memo. Here is the memo as it reads now.</p> : null}
      <p className="text-pretty text-[14.5px] font-medium leading-5 text-oa-fg">{card.top_line}</p>
      {card.week && card.week !== card.top_line ? <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{card.week}</p> : null}
      <MemoSection title="What changed" lines={card.changed} focus={card.focus?.id ?? null} />
      <MemoSection title="What could hurt" lines={card.hurt} focus={card.focus?.id ?? null} />
      <MemoSection title="Worth a look" lines={card.look} focus={card.focus?.id ?? null} />
    </Frame>
  );
}

function Agents({ card }: { card: AgentsCard }) {
  return (
    <Frame label="Your agents" right={<span className={NUM}>{card.total}</span>} source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />} flush>
      {card.focus_missing ? <p className="border-b border-oa-border px-3.5 py-2 text-pretty text-[13px] leading-5 text-oa-muted-fg">The agent you came from is not in your account any more. These are the agents you have.</p> : null}
      {card.rows.length === 0 ? (
        <p className="px-3.5 py-3 text-[14px] leading-5 text-oa-muted-fg">
          You have no agents yet.{" "}
          <AppLink href="/agents" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-2">
            Set one up
          </AppLink>{" "}
          and it will check the market for you every day.
        </p>
      ) : (
        <ul className={`${SCROLL_8} divide-y divide-oa-border`}>
          {card.rows.map((row) => (
            <li key={row.id} className={`px-3.5 py-2.5 ${row.id === card.focus ? "bg-oa-accent" : ""}`}>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <AppLink href={`/agents/jobs?job=${encodeURIComponent(row.id)}`} className={`text-[14px] font-medium text-oa-fg hover:underline ${FOCUS}`}>
                  {row.name}
                </AppLink>
                {row.enabled ? null : <Tag>Paused</Tag>}
                {row.last_run ? <span className="text-[12px] text-oa-muted-fg">{row.last_run.decision} on {fmtDay(row.last_run.day)}</span> : <span className="text-[12px] text-oa-muted-fg">Not run yet</span>}
              </div>
              <p className="mt-0.5 text-pretty text-[13px] leading-5 text-oa-muted-fg">{row.last_run?.summary ?? row.watches}</p>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

function Research({ card }: { card: ResearchCard }) {
  return (
    <Frame label={`Your ${card.ticker} research`} right={<span className={NUM}>{fmtDay(card.created_at, true)}</span>} source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />}>
      {card.headline ? <p className="text-pretty text-[14.5px] font-medium leading-5 text-oa-fg">{card.headline}</p> : null}
      {card.summary.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-pretty text-[13.5px] leading-5 text-oa-fg marker:text-oa-muted-fg">
          {card.summary.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      ) : null}
      {card.watch.length > 0 ? (
        <div className="mt-3">
          <p className="oa-caption mb-1">What to watch</p>
          <ul className="space-y-1 text-pretty text-[13.5px] leading-5 text-oa-fg">
            {card.watch.map((row, index) => (
              <li key={index}>
                {row.date ? <span className={`${NUM} mr-2 text-[12px] text-oa-muted-fg`}>{fmtDay(row.date)}</span> : null}
                {row.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 text-[13px]">
        <AppLink href={card.href} className="font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
          Read the full report
        </AppLink>
        <span className="text-oa-muted-fg">{` · ${card.sources} sources`}</span>
      </p>
    </Frame>
  );
}

function ResearchList({ card }: { card: ResearchListCard }) {
  return (
    <Frame label="Your research reports" source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />} flush>
      {card.reports.length === 0 ? (
        <p className="px-3.5 py-3 text-[14px] leading-5 text-oa-muted-fg">You have no research reports yet. Start one from any stock page.</p>
      ) : (
        <ul className={`${SCROLL_8} divide-y divide-oa-border`}>
          {card.reports.map((report) => (
            <li key={`${report.ticker}-${report.key}`}>
              <AppLink href={report.href} className={`flex items-baseline gap-3 px-3.5 py-2 hover:bg-oa-accent ${FOCUS}`}>
                <span className={`${NUM} w-16 shrink-0 text-[13.5px] font-medium text-oa-fg`}>{report.ticker}</span>
                <span className="min-w-0 flex-1 text-pretty text-[13.5px] leading-5 text-oa-fg">{report.headline ?? (report.status === "running" ? "Still being written" : "No headline")}</span>
                <span className={`${NUM} shrink-0 text-[11.5px] text-oa-muted-fg`}>{fmtDay(report.created_at)}</span>
              </AppLink>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

function BriefingItem({ card }: { card: BriefingItemCard }) {
  return (
    <Frame
      label={<span className="inline-flex items-center gap-2">From your briefing <TickerLink symbol={card.ticker} logo={14} /></span>}
      right={card.day_change_pct !== null ? <Delta value={card.day_change_pct} /> : null}
      source={<SourceLine source={card.source} asOf={card.as_of} href={card.source_url} />}
    >
      <p className="text-pretty text-[14.5px] font-medium leading-5 text-oa-fg">{card.headline}</p>
      {card.why ? <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{card.why}</p> : null}
      {card.evidence.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[13px] leading-5">
          {card.evidence.map((row, index) => (
            <li key={index} className="text-oa-muted-fg">
              {row.url ? (
                <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
                  {row.label}
                </a>
              ) : (
                <span className="text-oa-fg">{row.label}</span>
              )}
              {` · ${row.source}`}
            </li>
          ))}
        </ul>
      ) : null}
    </Frame>
  );
}

function RuleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-oa-muted-fg">{label}</dt>
      <dd className="min-w-0 text-pretty text-oa-fg">{children}</dd>
    </>
  );
}

const LINK_BUTTON = `inline-flex h-8 items-center rounded-lg border border-oa-border px-3 text-[13px] font-medium text-oa-fg hover:bg-oa-accent ${FOCUS}`;

/**
 * "Keep watching": the agent an answer leads to, read back in the watch box's own words, with which stocks, when it
 * checks and how it tells you, before anything is saved. When the person asked when to buy or sell (`offer`), the card
 * first shows only that one-tap question. Signed in, one tap saves it through the agents API (POST /api/agents/save) with the
 * card's own drafts; nothing is created without that tap, and the plan's limits apply exactly as on the Agents page.
 * Signed out, or on a card from before the rule was stored, the button opens the Agents page with the request filled in.
 */
function Watch({ card, actions }: { card: WatchCard; actions: CardActions }) {
  const [save, setSave] = React.useState<SaveState>({ phase: "idle" });
  // "The next check is today" depends on the reader's clock, so it is worked out in the browser, never on the server.
  const [when, setWhen] = React.useState<string | null>(null);
  React.useEffect(() => setWhen(watchWhenWords()), []);
  // "When should I sell?" answers first; the watch waits behind one tap.
  const [open, setOpen] = React.useState(false);
  const already = card.status === "already";
  if (already) {
    return (
      <div className="oa-surface border border-oa-border bg-oa-card px-3.5 py-3">
        <p className="text-pretty text-[14px] leading-5 text-oa-fg">
          {`You already have ${card.existing.length === 1 ? "an agent" : "agents"} for this: ${card.existing.map((job) => `${job.name}${job.enabled ? "" : " (paused)"}`).join(", ")}.`}
        </p>
        <div className="mt-2.5">
          <AppLink href="/agents" className={LINK_BUTTON}>
            See your agents
          </AppLink>
        </div>
      </div>
    );
  }
  if (card.offer && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-9 items-center rounded-full border border-oa-border bg-oa-card px-3.5 text-left text-[14px] font-medium leading-5 text-oa-fg transition-colors hover:bg-oa-accent ${FOCUS}`}
      >
        {card.offer}
      </button>
    );
  }
  const rule = card.rule;
  const oneTap = actions.signedIn && Boolean(rule) && (card.drafts?.length ?? 0) > 0 && card.outlook?.kind !== "full";
  const saved = save.phase === "on" || save.phase === "paused" || save.phase === "already";
  const confirm = async () => {
    setSave({ phase: "running" });
    try {
      const response = await fetch("/api/agents/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ drafts: card.drafts }) });
      const body = (await response.json().catch(() => null)) as SaveResponse | null;
      setSave(saveOutcome(response.ok, body));
    } catch {
      setSave({ phase: "failed", message: "We could not reach the server. Nothing was set up." });
    }
  };
  const tag = save.phase === "on" ? <Tag tone="up">On</Tag> : save.phase === "paused" ? <Tag tone="warn">Saved, paused</Tag> : save.phase === "already" ? <Tag>Already set up</Tag> : null;
  const lock = lockCopy("agents");
  return (
    <Frame label="Keep watching" right={tag}>
      {/* The watch box's own read-back (lib/agents-plain/parse.ts), word for word, so Ask and the Agents page say one thing. */}
      <p className="text-pretty text-[15px] font-medium leading-[22px] text-oa-fg">{card.preview}</p>
      {rule ? (
        <dl className="mt-2.5 grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13.5px] leading-5">
          <RuleRow label={rule.mine || rule.stocks.length !== 1 ? "Stocks" : "Stock"}>
            {rule.mine ? (
              "Every stock you track"
            ) : (
              <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                {rule.stocks.map((stock) => (
                  <span key={stock.ticker} className="inline-flex min-w-0 items-baseline gap-1.5" title={stock.name}>
                    <TickerLink symbol={stock.ticker} logo={14} className="text-[13px]" />
                    {stock.name && stock.name !== stock.ticker ? <span className="truncate text-oa-muted-fg">{stock.name}</span> : null}
                  </span>
                ))}
              </span>
            )}
          </RuleRow>
          <RuleRow label="When">
            {when ?? WATCH_WHEN_PLAIN}
          </RuleRow>
          <RuleRow label="How">{WATCH_HOW_WORDS}</RuleRow>
        </dl>
      ) : null}
      {card.note && !saved ? <p className="mt-2 text-pretty text-[12.5px] leading-5 text-oa-muted-fg">{card.note}</p> : null}
      {actions.signedIn && card.outlook && !saved ? <p className="mt-2 text-pretty text-[13px] leading-5 text-oa-label">{card.outlook.line}</p> : null}

      {save.phase === "on" ? (
        <p className="mt-2.5 text-pretty text-[13.5px] leading-5 text-oa-fg" role="status">
          It&apos;s on. You&apos;ll hear by email on the first day it happens.{save.missed ? ` ${save.missed}` : ""}{" "}
          <AppLink href="/agents" className={`underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg ${FOCUS}`}>
            See your agents
          </AppLink>
        </p>
      ) : save.phase === "already" ? (
        <p className="mt-2.5 text-pretty text-[13.5px] leading-5 text-oa-fg" role="status">
          You already had this agent, so nothing changed.{" "}
          <AppLink href="/agents" className={`underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg ${FOCUS}`}>
            See your agents
          </AppLink>
        </p>
      ) : save.phase === "paused" ? (
        <div className="mt-2.5 text-pretty text-[13.5px] leading-5" role="status">
          <p className="font-medium text-oa-fg">
            {save.on > 0 ? `${save.on} ${save.on === 1 ? "is" : "are"} on and ${save.paused} ${save.paused === 1 ? "is" : "are"} saved and paused` : save.message ? "Saved and paused" : lock.title}
          </p>
          <p className="mt-0.5 text-oa-muted-fg">
            {save.message ?? lock.body}
            {save.missed ? ` ${save.missed}` : ""}
          </p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <AppLink href="/agents" className={`text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg ${FOCUS}`}>
              See your agents
            </AppLink>
            <AppLink href="/pricing#agents" className={`text-oa-muted-fg underline decoration-oa-border underline-offset-2 hover:text-oa-fg ${FOCUS}`}>
              What is in Pro
            </AppLink>
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {oneTap ? (
            <>
              <OaButton size="sm" loading={save.phase === "running"} onClick={() => void confirm()}>
                Save this watch
              </OaButton>
              <AppLink href={card.href} className={`rounded text-[13px] text-oa-muted-fg underline decoration-oa-border underline-offset-2 hover:text-oa-fg ${FOCUS}`}>
                Change it first
              </AppLink>
            </>
          ) : actions.signedIn && card.outlook?.kind === "full" ? (
            <AppLink href="/agents" className={LINK_BUTTON}>
              Open your agents
            </AppLink>
          ) : (
            // Signed out too: the Agents page opens the filled-in agent with its last four weeks, and asks for an
            // account only when it is saved.
            <AppLink href={card.href} className={`inline-flex h-8 items-center rounded-lg bg-oa-primary px-3 text-[13px] font-medium text-oa-primary-fg hover:opacity-90 ${FOCUS}`}>
              Save this watch
            </AppLink>
          )}
        </div>
      )}
      {save.phase === "failed" ? (
        <p className="mt-2 text-[13px] leading-5 text-signal-bearish" role="alert">
          {save.message}
        </p>
      ) : null}
    </Frame>
  );
}

/* ── the switch ─────────────────────────────────────────────────────────── */

export function AskCardView({ card, actions }: { card: AskCard; actions: CardActions }) {
  switch (card.card) {
    case "quote":
      return <Quote card={card} />;
    case "returns":
      return <Returns card={card} />;
    case "compare":
      return <Compare card={card} />;
    case "portfolio":
      return <Portfolio card={card} />;
    case "changes":
      return <Changes card={card} />;
    case "market_brief":
      return <MarketBrief card={card} />;
    case "screens":
      return <Screens card={card} />;
    case "themes":
      return <Themes card={card} />;
    case "news":
      return <News card={card} />;
    case "web":
      return <Web card={card} />;
    case "earnings":
      return <Earnings card={card} />;
    case "backtest":
      return <Backtest card={card} />;
    case "fund":
      return <Fund card={card} />;
    case "investors":
      return <Investors card={card} />;
    case "congress":
      return <Congress card={card} />;
    case "insiders":
      return <Insiders card={card} />;
    case "markets":
      return <Markets card={card} />;
    case "basket":
      return <Basket card={card} actions={actions} />;
    case "action":
      return <Action card={card} actions={actions} />;
    case "reasons":
      return <Reasons card={card} />;
    case "memo":
      return <Memo card={card} />;
    case "agents":
      return <Agents card={card} />;
    case "research":
      return <Research card={card} />;
    case "research_list":
      return <ResearchList card={card} />;
    case "briefing_item":
      return <BriefingItem card={card} />;
    case "watch":
      return <Watch card={card} actions={actions} />;
    case "sign_in":
      return (
        <div className="oa-surface flex flex-wrap items-center justify-between gap-3 border border-oa-border bg-oa-card px-3.5 py-3">
          <p className="min-w-0 text-[14px] leading-5 text-oa-fg">{card.message}</p>
          <OaButton size="sm" onClick={actions.signIn}>
            Sign in
          </OaButton>
        </div>
      );
    case "error":
      return (
        <p className="oa-surface border border-oa-border bg-oa-bg px-3.5 py-2.5 text-[13.5px] leading-5 text-oa-muted-fg">
          <span className="oa-caption mr-2">Not found</span>
          {card.message}
        </p>
      );
    case "matches":
      return null;
  }
}
