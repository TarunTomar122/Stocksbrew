import Link from "next/link";
import * as React from "react";

import { FOCUS, NUM, Tag, Ticker } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { CALL_FILL, ConcentrationPanel, FactRow, SectorPanel, WeightTrack, chartMax, sectorWord } from "@/components/portfolio-ideas/charts";
import { barGeometry } from "@/components/stock-report/fact-bars";
import { RatePicker } from "@/components/portfolio-ideas/rate-picker";
import { capitalize, dayWords } from "@/lib/day-words";
import type { CardFacts } from "@/lib/portfolio-ideas/facts";
import { concentrationTitle, tailSpan, topShare } from "@/lib/portfolio-ideas/mix";
import { COMPANY_LINE, MAX_COMPANIES, TRIM_MIN_USD } from "@/lib/portfolio-ideas/rebalance";
import type { IdeasView as IdeasData } from "@/lib/portfolio-ideas/server";
import type { AddIdea, CallWord, LossIdea, RebalancePlan, SaleTax, TaxRates, TrimIdea } from "@/lib/portfolio-ideas/types";
import { watchDropsHref } from "@/lib/portfolio-ideas/watch";
import { callPlain, fmtPct, usd } from "@/lib/portfolio-ideas/words";
import { fmtShares } from "@/lib/portfolio-shared";

/**
 * /portfolio/ideas, figures first (owner, Nov 12: "this entire page is like super text heavy... make it super
 * visual"). From the top: the concentration chart beside the sector mix, one card per stock the ideas are about
 * (trims, the ones over the line we would keep, adds), the losses that could be sold for tax, then one muted line and
 * the method folded away. Every number is the same rules' output as before; only the way it is shown changed.
 * Nothing here places a trade.
 */

export const WASH_SALE_SENTENCE =
  "The wash-sale rule: if you buy the same stock, or one that is substantially identical, within 30 days before or after selling it at a loss, the loss is put off until you sell the new shares.";

type CardData = IdeasData["facts"][string] | undefined;

const CHIP = `${NUM} inline-flex items-center gap-1 rounded-full border border-oa-border bg-oa-bg px-2 py-0.5 text-[13px] leading-5 text-oa-fg`;

/* ── The grid ─────────────────────────────────────────────────────────── */

/**
 * Cards keep one fixed width (owner rule 4: never stretched): one column on a phone, two from 36rem, three from 60rem.
 * Where the last row has empty slots, the companion panel takes them, at the same height as the cards, holding real
 * content (the money raised, the tax figures, the notes, the method). Where the cards end level, the companion is a
 * plain row under them. Literal class names, so Tailwind sees each one.
 */
const GRID = "grid grid-cols-1 gap-3 [@container(min-width:36rem)]:grid-cols-2 [@container(min-width:60rem)]:grid-cols-3";
// Two columns at every width, for two or four cards whose companion has too little to fill a card slot: the cards end
// level and the companion sits as a plain row under them.
const GRID_TWO = "grid grid-cols-1 gap-3 [@container(min-width:36rem)]:grid-cols-2";

const SPAN_2: Record<number, string> = {
  1: "[@container(min-width:36rem)]:col-span-1",
  2: "[@container(min-width:36rem)]:col-span-2",
};
const SPAN_3: Record<number, string> = {
  1: "[@container(min-width:60rem)]:col-span-1",
  2: "[@container(min-width:60rem)]:col-span-2",
  3: "[@container(min-width:60rem)]:col-span-3",
};
const PANEL_2 =
  "[@container(min-width:36rem)]:rounded-[12px] [@container(min-width:36rem)]:border [@container(min-width:36rem)]:border-oa-border [@container(min-width:36rem)]:bg-oa-card [@container(min-width:36rem)]:p-4 [@container(min-width:36rem)]:[box-shadow:var(--oa-shadow)]";
// A companion that spans the whole row is a strip: its blocks side by side, never stacked down half the row.
const STRIP_2 =
  "[@container(min-width:36rem)]:[&>*]:!mt-0 [@container(min-width:36rem)]:grid [@container(min-width:36rem)]:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] [@container(min-width:36rem)]:items-start [@container(min-width:36rem)]:gap-x-8";
const STRIP_3 =
  "[@container(min-width:60rem)]:[&>*]:!mt-0 [@container(min-width:60rem)]:grid [@container(min-width:60rem)]:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] [@container(min-width:60rem)]:items-start [@container(min-width:60rem)]:gap-x-8";
// Back to a stacked panel where the row has room for it beside the cards.
const STACK_3 = "[@container(min-width:60rem)]:flex [@container(min-width:60rem)]:items-stretch [@container(min-width:60rem)]:[&>*:last-child]:!mt-auto";
// Two slots wide (one card in the last row): its blocks in two columns, not one long sparse list.
const TWO_COLS_3 =
  "[@container(min-width:60rem)]:grid [@container(min-width:60rem)]:grid-cols-2 [@container(min-width:60rem)]:content-between [@container(min-width:60rem)]:gap-x-8";

/**
 * The companion's span and layout after `cards` cards: in the last row's empty slots it is a panel as tall as the
 * cards; across a whole row it is a strip with its blocks side by side. On a phone it is a plain block under the cards.
 */
function companionClass(cards: number, threeCols: boolean, split: boolean): string {
  const two = tailSpan(cards, 2);
  const three = tailSpan(cards, 3);
  const at3 = !threeCols
    ? ""
    : three === 3
      ? `${SPAN_3[3]} ${STRIP_3}`
      : three === 2 && split
        ? `${SPAN_3[2]} ${TWO_COLS_3}`
        : `${SPAN_3[three]} ${two === 2 ? STACK_3 : ""}`;
  return [
    // Its blocks keep their natural spacing; only the last one (the method) is pinned to the foot.
    "flex min-w-0 flex-col gap-4 px-2 sm:px-0",
    SPAN_2[two],
    PANEL_2,
    two === 2 ? STRIP_2 : "",
    at3,
  ].join(" ");
}

function Companion({ cards, threeCols = true, split = false, children }: { cards: number; threeCols?: boolean; split?: boolean; children: React.ReactNode }) {
  return <li className={companionClass(cards, threeCols, split)}>{children}</li>;
}

/**
 * One stock card: `lead` (logo, call, the big figure), `side` (the chips: dollars, tax, wash-sale window) and `middle`
 * (the bars and the line on what would change the call). The side comes before the middle when `sideFirst`, and the
 * last part takes the spare height so its foot line sits on the card's bottom edge.
 */
function CardShell({ lead, middle, side, sideFirst = false }: { lead: React.ReactNode; middle?: React.ReactNode; side?: React.ReactNode; sideFirst?: boolean }) {
  // The middle takes the card's spare height: its price trend grows into it, so cards in a row end level with no
  // empty foot (owner rules 3 and 4).
  const middleBox = middle ? (
    <div key="middle" className="flex min-w-0 flex-1 flex-col gap-2.5">
      {middle}
    </div>
  ) : null;
  const sideBox = side ? (
    <div key="side" className="flex min-w-0 flex-col gap-2.5">
      {side}
    </div>
  ) : null;
  return (
    <li className="oa-surface flex min-w-0 flex-col gap-3 border border-oa-border bg-oa-card p-4">
      <div className="flex min-w-0 flex-col gap-3">{lead}</div>
      {sideFirst ? [sideBox, middleBox] : [middleBox, sideBox]}
    </li>
  );
}

/* ── Card parts ───────────────────────────────────────────────────────── */

function CallTag({ call }: { call: CallWord | null }) {
  if (!call) return null;
  return (
    <Tag caps={false} tone={call === "Add" ? "up" : call === "Trim" ? "down" : "neutral"}>
      {callPlain(call)}
    </Tag>
  );
}

/** Logo, ticker and name on the left, our call on the right. The ticker links to the stock. */
function CardHead({ ticker, name, call }: { ticker: string; name: string; call: CallWord | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Ticker symbol={ticker} name={name} size={22} className="min-w-0" />
      <span className="shrink-0">
        <CallTag call={call} />
      </span>
    </div>
  );
}

function dollars(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The stock's price and today's move, from one quote (owner rule 4: every stock card shows its price beside its move).
 * A price with no move today (a stored close) shows alone; an older figure is never labelled as today's.
 */
function Price({ data }: { data: CardData }) {
  const shown = dollars(data?.price);
  if (!shown) return null;
  const day = data?.dayPct;
  // Rounded first, so a tiny fall reads "0.0%", never "−0.0%" in red.
  const move = typeof day === "number" && Number.isFinite(day) ? Math.round(day * 10) / 10 || 0 : null;
  return (
    <span className={`${NUM} ml-auto shrink-0 whitespace-nowrap text-[13.5px] text-oa-muted-fg`}>
      {shown}
      {move !== null ? (
        <span className="ml-1.5" style={{ color: move > 0 ? "var(--signal-bullish)" : move < 0 ? "var(--signal-bearish)" : undefined }}>
          {move > 0 ? "+" : move < 0 ? "−" : ""}
          {Math.abs(move).toFixed(1)}%
        </span>
      ) : null}
    </span>
  );
}

function Facts({ facts, ticker }: { facts: CardFacts | undefined; ticker: string }) {
  if (!facts || facts.rows.length === 0) return null;
  return (
    <>
      {facts.rows.map((fact) => (
        <FactRow key={fact.kind} fact={fact} ticker={ticker} />
      ))}
    </>
  );
}

/**
 * The stock's price over the past three months (the screener snapshot's line), with its move. It takes whatever height
 * the card has spare, between a small and a tall limit, so a card beside a taller one fills with the trend instead of
 * an empty foot.
 */
function Trend({ data }: { data: CardData }) {
  const points = data?.spark;
  if (!points || points.length < 2) return null;
  const low = Math.min(...points);
  const high = Math.max(...points);
  const span = high - low || 1;
  const d = `M${points.map((value, index) => `${((index / (points.length - 1)) * 100).toFixed(2)} ${(38 - ((value - low) / span) * 36).toFixed(2)}`).join(" L")}`;
  const move = data?.ret3m ?? (points[points.length - 1]! / points[0]! - 1) * 100;
  const color = move > 0 ? "var(--signal-bullish)" : move < 0 ? "var(--signal-bearish)" : "var(--oa-muted-fg)";
  return (
    <div className="flex min-h-[4.25rem] max-h-60 flex-1 flex-col">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="oa-caption">Past 3 months</span>
        <span className={`${NUM} font-medium`} style={{ color }}>
          {move > 0 ? "+" : move < 0 ? "−" : ""}
          {Math.abs(move) >= 10 ? Math.round(Math.abs(move)) : Math.abs(move).toFixed(1)}%
        </span>
      </div>
      <div className="relative mt-1 min-h-8 flex-1">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
          <path d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

/** What would change the call, one line at the foot; nothing when the reason names nothing we can draw. */
function Change({ facts }: { facts: CardFacts | undefined }) {
  if (!facts?.change) return null;
  // Each phrase stays whole ("Sell some below 9%" never loses its figure to the next line); only the "·" may break.
  const parts = facts.change.split(" · ");
  return (
    <p className="mt-auto border-t border-oa-border pt-2.5 text-[13px] leading-[18px] text-oa-muted-fg">
      {parts.map((part, index) => (
        <React.Fragment key={part}>
          {index > 0 ? " · " : null}
          <span className="whitespace-nowrap">{part}</span>
        </React.Fragment>
      ))}
    </p>
  );
}

function Weight({
  pct,
  label,
  after,
  max,
  call,
  data,
  line,
}: {
  pct: number;
  label: string;
  after?: number;
  max: number;
  call: CallWord | null;
  data: CardData;
  line?: number;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={`${NUM} text-[28px] font-semibold leading-8 tracking-[-0.02em] text-oa-fg`}>{fmtPct(pct)}</span>
        <span className="min-w-0 truncate text-[13px] text-oa-muted-fg">{label}</span>
        <Price data={data} />
      </div>
      <div className="mt-2">
        <WeightTrack before={pct} after={after} max={max} fill={CALL_FILL[call ?? "none"]} line={line} />
      </div>
    </div>
  );
}

/** "Tax ~$420", "Tax $90 lower", "About no tax". */
function taxWords(value: number): string {
  if (Math.abs(value) < 5) return "About no tax";
  return value > 0 ? `Tax ~${usd(value)}` : `Tax ${usd(value)} lower`;
}

/** The tax chip, saying plainly when some of the shares sold have no cost and are left out of it. */
function taxChip(tax: SaleTax | null): string {
  if (!tax) return "No cost on record";
  const unmatched = Math.round(tax.unmatchedShares);
  return unmatched > 0 ? `${taxWords(tax.tax)}, ${unmatched} ${unmatched === 1 ? "share" : "shares"} uncosted` : taxWords(tax.tax);
}

/* ── Cards ────────────────────────────────────────────────────────────── */

function TrimCard({ trim, data, max, today, example }: { trim: TrimIdea; data: CardData; max: number; today: string; example: boolean }) {
  const tax = trim.tax;
  // A sector or drift trim aims for its own line (the S&P weight plus the gap, or the share first put in), not 10%,
  // and is drawn on its own scale so a big sector share does not squash the company cards.
  const company = trim.kind === "company";
  return (
    <CardShell
      sideFirst
      lead={
        <>
          <CardHead ticker={trim.ticker} name={trim.name} call={trim.call} />
          <Weight
            data={data}
            pct={trim.before}
            after={trim.after}
            max={company ? max : chartMax([trim.before, trim.target])}
            line={company ? undefined : trim.target}
            call={trim.call}
            label={trim.kind === "sector" ? `in ${sectorWord(trim.subject)}` : "of the portfolio"}
          />
          <p className="text-[15px] font-medium leading-[22px] text-oa-fg">
            Sell ~{trim.shares} {trim.shares === 1 ? "share" : "shares"} → <span className={NUM}>{fmtPct(trim.after)}</span>
          </p>
        </>
      }
      side={
        <div className="flex flex-wrap gap-1.5">
          <span className={CHIP}>{usd(trim.amount)}</span>
          <span className={CHIP}>{taxChip(tax)}</span>
          {tax?.waitUntil && tax.waitTax !== null ? (
            <span className={CHIP} title="When these shares turn long term, at today's price.">
              {taxWords(tax.waitTax)} after {dayWords(tax.waitUntil, today)}
            </span>
          ) : null}
          {trim.cheaper ? (
            <span className={CHIP} title={`Selling ${example ? "the" : "your"} highest-cost shares first. Most brokers let you pick.`}>
              Costliest lots first: {taxWords(trim.cheaper.tax).toLowerCase()}
            </span>
          ) : null}
        </div>
      }
      middle={
        data?.rows.length || data?.change || data?.spark ? (
          <>
            <Facts facts={data} ticker={trim.ticker} />
            <Trend data={data} />
            <Change facts={data} />
          </>
        ) : null
      }
    />
  );
}

function HeldCard({ row, data, max }: { row: RebalancePlan["buyMoreOver"][number]; data: CardData; max: number }) {
  return (
    <CardShell
      lead={
        <>
          <CardHead ticker={row.ticker} name={row.name} call={row.call} />
          <Weight data={data} pct={row.pct} max={max} call={row.call} label="of the portfolio" />
        </>
      }
      middle={
        data?.rows.length || data?.change || data?.spark ? (
          <>
            <Facts facts={data} ticker={row.ticker} />
            <Trend data={data} />
            <Change facts={data} />
          </>
        ) : null
      }
    />
  );
}

function AddCard({ add, data, max }: { add: AddIdea; data: CardData; max: number }) {
  return (
    <CardShell
      sideFirst
      lead={
        <>
          <CardHead ticker={add.ticker} name={add.name} call={add.call} />
          <Weight data={data} pct={add.before} after={add.after} max={max} call={add.call} label="of the portfolio" />
          <p className="text-[15px] font-medium leading-[22px] text-oa-fg">
            Add ~{add.shares} {add.shares === 1 ? "share" : "shares"} → <span className={NUM}>{fmtPct(add.after)}</span>
          </p>
        </>
      }
      side={
        <div className="flex flex-wrap gap-1.5">
          <span className={CHIP}>{usd(add.amount)}</span>
        </div>
      }
      middle={
        data?.rows.length || data?.change || data?.spark ? (
          <>
            <Facts facts={data} ticker={add.ticker} />
            <Trend data={data} />
            <Change facts={data} />
          </>
        ) : null
      }
    />
  );
}

/** Small logo chips with a share: "AMZN 11%". */
function LogoChips({ rows }: { rows: Array<{ ticker: string; pct?: number }> }) {
  return (
    <>
      {rows.map((row) => (
        <Link key={row.ticker} href={`/stock/${encodeURIComponent(row.ticker)}`} prefetch={false} className={`${CHIP} hover:border-oa-fg/40 ${FOCUS}`}>
          <StockLogo ticker={row.ticker} size={16} />
          {row.ticker}
          {row.pct !== undefined ? <span className="text-oa-muted-fg">{fmtPct(row.pct)}</span> : null}
        </Link>
      ))}
    </>
  );
}

/** Companies over the line with no card, each kind said once with its logos. */
function LeftOut({ plan }: { plan: RebalancePlan }) {
  const groups: Array<[string, RebalancePlan["moreOver"]]> = [
    [`Over ${COMPANY_LINE}% too; ideas start with the biggest ${MAX_COMPANIES === 3 ? "three" : MAX_COMPANIES}`, plan.moreOver],
    ["No share count or price to size a trim", plan.unsized],
    [`Over ${COMPANY_LINE}% only through funds`, plan.fundOnly],
    [`A trim would be under ${usd(TRIM_MIN_USD)}, too small to bother`, plan.small],
  ];
  const shown = groups.filter(([, rows]) => rows.length > 0);
  if (shown.length === 0) return null;
  return (
    <ul role="list" className="flex flex-col gap-2">
      {shown.map(([label, rows]) => (
        <li key={label} className="flex flex-wrap items-center gap-1.5 text-[13.5px] text-oa-muted-fg">
          <LogoChips rows={rows} />
          <span className="ml-1">{label}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-2 sm:px-0">
      <h2 className="text-[17px] font-semibold leading-6 tracking-[-0.01em] text-oa-fg">{title}</h2>
      {right ? <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{right}</div> : null}
    </div>
  );
}

/**
 * The tax assumptions in plain sight (council, Nov 12, rule 2): the two rates as small selects, then the two rules
 * every estimate uses. The rest of the method stays folded at the foot of the page.
 */
function TaxAssumptions({ rates }: { rates: TaxRates }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2 text-[13px] text-oa-muted-fg sm:px-0">
      <RatePicker rates={rates} />
      <span aria-hidden="true">·</span>
      <span>Oldest shares first</span>
      <span aria-hidden="true">·</span>
      <span>Federal only</span>
    </div>
  );
}

/**
 * What the sales raise, as one figure and a bar of where it goes: to the Buy more stocks, and what is left in cash. The
 * tax on the sales is its own chip. A strip over the cards, so the companion beside them never outgrows a card.
 */
function MoneyBlock({ plan }: { plan: RebalancePlan }) {
  if (plan.trims.length === 0 || !(plan.proceeds > 0)) return null;
  const added = plan.adds.reduce((sum, add) => sum + add.amount, 0);
  const share = (value: number) => `${Math.min(100, Math.max(0, (value / plan.proceeds) * 100))}%`;
  // One strip over the cards: the figure, the bar of where the money goes, and its chips.
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 sm:px-0">
      <div className="flex items-baseline gap-x-2">
        <span className={`${NUM} text-[22px] font-semibold leading-7 tracking-[-0.02em] text-oa-fg`}>{usd(plan.proceeds)}</span>
        <span className="text-[13px] text-oa-muted-fg">raised by the sales</span>
      </div>
      <span aria-hidden="true" className="flex h-2 w-40 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--oa-fg)_6%,transparent)]">
        <span className="h-full bg-[var(--signal-bullish)]" style={{ width: share(added) }} />
        <span className="h-full bg-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)]" style={{ width: share(plan.leftover) }} />
      </span>
      <div className="flex flex-wrap gap-1.5">
        {added > 0 ? (
          <span className={CHIP}>
            <span aria-hidden="true" className="size-2 rounded-[2px] bg-[var(--signal-bullish)]" />
            To Buy more {usd(added)}
          </span>
        ) : null}
        {plan.leftover >= 1 ? (
          <span className={CHIP}>
            <span aria-hidden="true" className="size-2 rounded-[2px] bg-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)]" />
            Cash {usd(plan.leftover)}
          </span>
        ) : null}
        {plan.taxTotal !== null ? <span className={CHIP}>{taxWords(plan.taxTotal)}</span> : null}
      </div>
    </div>
  );
}

/** The cards' stocks that have a dated next report, soonest first. */
function datedReports(view: IdeasData, tickers: string[]): Array<{ ticker: string; day: string }> {
  return [...new Set(tickers)]
    .map((ticker) => ({ ticker, day: view.facts[ticker]?.nextReport ?? null }))
    .filter((row): row is { ticker: string; day: string } => row.day !== null)
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Fewer dated reports than this and the block is left out: a list of one says little (owner rules 1 and 4). */
const MIN_REPORTS = 2;

/**
 * When the cards' stocks report next, soonest first: the report is what the line under each card says could move the
 * call. Only dated reports; a stock with no date yet is left out, never listed as "Not set".
 */
function NextReports({ view, tickers }: { view: IdeasData; tickers: string[] }) {
  const rows = datedReports(view, tickers);
  if (rows.length < MIN_REPORTS) return null;
  return (
    <div>
      <p className="oa-caption mb-1.5">Next reports</p>
      <ul role="list" className="flex max-w-md flex-col gap-1.5">
        {rows.map((row) => (
          <li key={row.ticker} className="flex items-center justify-between gap-3 text-[13.5px]">
            <Ticker symbol={row.ticker} size={18} />
            <span className="text-oa-fg">{capitalize(dayWords(row.day, view.today))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Roughly how many lines the ideas' companion holds. With fewer than eight it cannot fill a card slot (about eleven
 * lines), so two cards go side by side and the companion takes a plain row under them.
 */
function companionPlan(view: IdeasData): { lines: number } {
  const plan = view.plan;
  const notes = (plan.trims.length > 0 && plan.adds.length === 0 ? 2 : 0) + [plan.moreOver, plan.unsized, plan.fundOnly, plan.small].filter((rows) => rows.length > 0).length * 2;
  const reports = datedReports(view, [...plan.trims, ...plan.buyMoreOver, ...plan.adds].map((row) => row.ticker)).length;
  const doNothing = plan.trims.length === 0 && topShare(view.weights) ? 3 : 0;
  const stocks = yearRows(view, [...plan.trims, ...plan.buyMoreOver, ...plan.adds].map((row) => row.ticker)).length;
  const years = stocks > 0 ? stocks + (view.yearMarks.sp500 !== null ? 1 : 0) + (view.yearMarks.mix !== null ? 1 : 0) : 0;
  return { lines: (reports >= MIN_REPORTS ? reports + 1 : 0) + (years >= 2 ? years + 1 : 0) + doNothing + notes + 3 };
}

/**
 * With nothing to sell, what leaving it alone means: one line and one bar, the biggest five stocks (each its own
 * segment, in its call's colour) against everything else. A picture of how much rides on a few names.
 */
function DoNothing({ view }: { view: IdeasData }) {
  if (view.plan.trims.length > 0) return null;
  const top = topShare(view.weights);
  if (!top) return null;
  const rows = view.weights.slice(0, top.count);
  const rest = Math.max(0, 100 - top.pct);
  return (
    <div className="w-full max-w-md">
      <p className="text-[13.5px] text-oa-fg">
        Doing nothing keeps {view.subject === "example" ? "the" : "your"} top {top.count} at <span className={`${NUM} font-medium`}>{fmtPct(top.pct)}</span>.
      </p>
      <span
        role="img"
        aria-label={`Top ${top.count}: ${rows.map((row) => `${row.ticker} ${fmtPct(row.pct)}`).join(", ")}; everything else ${fmtPct(rest)}`}
        className="mt-2 flex h-3 w-full gap-px overflow-hidden rounded-[3px]"
      >
        {rows.map((row) => (
          <span key={row.ticker} title={`${row.ticker} ${fmtPct(row.pct)}`} className="h-full" style={{ width: `${row.pct}%`, background: CALL_FILL[row.call ?? "none"] }} />
        ))}
        <span className="h-full bg-[color-mix(in_srgb,var(--oa-fg)_8%,transparent)]" style={{ width: `${rest}%` }} />
      </span>
      <div className={`${NUM} mt-1.5 flex justify-between text-[13px] text-oa-muted-fg`}>
        <span>Top {top.count} {fmtPct(top.pct)}</span>
        <span>Everything else {fmtPct(rest)}</span>
      </div>
    </div>
  );
}

/** The cards' stocks with a past-year move, biggest first. */
function yearRows(view: IdeasData, tickers: string[]): Array<{ ticker: string; value: number }> {
  return [...new Set(tickers)]
    .map((ticker) => ({ ticker, value: view.facts[ticker]?.ret1y ?? null }))
    .filter((row): row is { ticker: string; value: number } => typeof row.value === "number" && Number.isFinite(row.value))
    .sort((a, b) => b.value - a.value);
}

type YearRow = { key: string; label: React.ReactNode; value: number; mark?: boolean };

/**
 * How each stock on the cards moved over the past year, against the S&P 500 and today's mix of holdings, as signed
 * bars from one zero line (the cards show three months, so this is the longer view). Rows keep their natural spacing.
 */
function PastYear({ view, tickers }: { view: IdeasData; tickers: string[] }) {
  const stocks = yearRows(view, tickers);
  if (stocks.length < 1) return null;
  const marks: YearRow[] = [];
  if (view.yearMarks.sp500 !== null)
    marks.push({ key: "sp500", label: <span className="text-oa-muted-fg">S&amp;P 500</span>, value: view.yearMarks.sp500, mark: true });
  if (view.yearMarks.mix !== null)
    marks.push({
      key: "mix",
      label: <span className="text-oa-muted-fg">{view.subject === "example" ? "This mix" : "Your mix"}</span>,
      value: view.yearMarks.mix,
      mark: true,
    });
  const rows: YearRow[] = [...stocks.map((row) => ({ key: row.ticker, label: <Ticker symbol={row.ticker} size={18} />, value: row.value })), ...marks];
  if (rows.length < 2) return null;
  const { zero, bars } = barGeometry(rows.map((row) => row.value));
  return (
    <div>
      <p className="oa-caption mb-1.5">Past year</p>
      <ul role="list" className="flex flex-col gap-1.5">
        {rows.map((row, index) => {
          const bar = bars[index]!;
          const fill = row.mark ? "color-mix(in srgb, var(--oa-fg) 45%, transparent)" : bar.negative ? "var(--signal-bearish)" : "var(--signal-bullish)";
          return (
            <li
              key={row.key}
              className={`grid grid-cols-[5.5rem_minmax(0,1fr)_3rem] items-center gap-x-2 text-[13.5px] ${row.mark && index === stocks.length ? "mt-1 border-t border-oa-border pt-2" : ""}`}
            >
              <span className="min-w-0 truncate">{row.label}</span>
              <span aria-hidden="true" className="relative h-2 rounded-full bg-[color-mix(in_srgb,var(--oa-fg)_6%,transparent)]">
                <span className="absolute inset-y-0 rounded-full" style={{ left: `${bar.left}%`, width: `${Math.max(bar.width, 1)}%`, background: fill }} />
                {zero > 0 ? <span className="absolute -inset-y-0.5 w-px bg-oa-muted-fg" style={{ left: `${zero}%` }} /> : null}
              </span>
              <span className={`${NUM} text-right text-[13px] text-oa-fg`}>{signedWhole(row.value)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function hasIdeaNotes(plan: RebalancePlan): boolean {
  return (plan.trims.length > 0 && plan.adds.length === 0) || plan.moreOver.length + plan.unsized.length + plan.fundOnly.length + plan.small.length > 0;
}

/** The notes under the stock cards: where the rest of the money goes, and the companies over the line with no card. */
function IdeaNotes({ plan }: { plan: RebalancePlan }) {
  if (!hasIdeaNotes(plan)) return null;
  const noRoom = plan.trims.length > 0 && plan.adds.length === 0;
  return (
    <div className="flex flex-col gap-2">
      {noRoom ? <p className="text-[13.5px] text-oa-muted-fg">No Buy more stock has room for it, so it could sit in cash.</p> : null}
      <LeftOut plan={plan} />
    </div>
  );
}

function IdeaCards({ view, max, ratesHere, tail }: { view: IdeasData; max: number; ratesHere: boolean; tail: React.ReactNode }) {
  const { plan } = view;
  const example = view.subject === "example";
  const cards = plan.trims.length + plan.buyMoreOver.length + plan.adds.length;
  const leftOut = plan.moreOver.length + plan.unsized.length + plan.fundOnly.length + plan.small.length;
  if (cards === 0 && leftOut === 0) return null;
  const trims = plan.trims.length;
  const companion = companionPlan(view);
  // Four cards always go two by two: three across would leave the companion two slots wide and half empty.
  const twoByTwo = cards === 4 || (cards === 2 && companion.lines < 8);
  const cardTickers = [...plan.trims.map((trim) => trim.ticker), ...plan.buyMoreOver.map((row) => row.ticker), ...plan.adds.map((add) => add.ticker)];
  const title = trims > 0 ? (plan.adds.length > 0 ? "Sell some, add to others" : `Sell some of ${trims === 1 ? "one stock" : `${trims} stocks`}`) : "Why we'd keep them";
  return (
    <section className="flex flex-col gap-3" aria-label="Ideas by stock">
      <SectionHead title={cards > 0 ? title : `Over ${COMPANY_LINE}%`} />
      {ratesHere ? <TaxAssumptions rates={view.rates} /> : null}
      <MoneyBlock plan={plan} />
      {cards > 0 ? (
        <div className="[container-type:inline-size]">
          <ul role="list" className={twoByTwo ? GRID_TWO : GRID}>
            {plan.trims.map((trim) => (
              <TrimCard key={trim.id} trim={trim} data={view.facts[trim.ticker]} max={max} today={view.today} example={example} />
            ))}
            {plan.buyMoreOver.map((row) => (
              <HeldCard key={row.ticker} row={row} data={view.facts[row.ticker]} max={max} />
            ))}
            {plan.adds.map((add) => (
              <AddCard key={add.id} add={add} data={view.facts[add.ticker]} max={max} />
            ))}
            {/* The rest of the last row: the next reports, the notes and the method, as tall as the cards, or a strip under them. */}
            <Companion cards={cards} threeCols={!twoByTwo} split>
              <NextReports
                view={view}
                tickers={cardTickers}
              />
              <PastYear view={view} tickers={cardTickers} />
              <DoNothing view={view} />
              <IdeaNotes plan={plan} />
              {tail}
            </Companion>
          </ul>
        </div>
      ) : hasIdeaNotes(plan) || tail ? (
        <div className="flex flex-col gap-3 px-2 sm:px-0">
          <IdeaNotes plan={plan} />
          {tail}
        </div>
      ) : null}
    </section>
  );
}

/* ── Losses ──────────────────────────────────────────────────────────── */

function termWord(loss: LossIdea): string {
  const mixed = loss.short + loss.unknown < -0.5 && loss.long < -0.5;
  if (mixed) return "Short and long term";
  return loss.term === "long" ? "Long term" : loss.term === "short" ? "Short term" : "Buy day unknown";
}

/** This loss's wash-sale window: a strip from today to the first day it is safe to buy back, in day words. */
function WashWindow({ from, today }: { from: string; today: string }) {
  return (
    <div title={WASH_SALE_SENTENCE} className="flex items-center gap-2 text-[13px] text-oa-muted-fg">
      <span aria-hidden="true" className="relative ml-1.5 h-1.5 w-12 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--signal-bearish)_18%,transparent)]">
        <span className="absolute -top-[3px] left-0 size-3 -translate-x-1/2 rounded-full border-2 border-oa-card bg-[var(--signal-bearish)]" />
        <span className="absolute -top-[3px] right-0 size-3 translate-x-1/2 rounded-full border-2 border-oa-card bg-[var(--signal-bullish)]" />
      </span>
      <span className="ml-1 text-oa-fg">Wait until {dayWords(from, today)} to buy back</span>
    </div>
  );
}

function LossCard({ loss, max, today, data, shared }: { loss: LossIdea; max: number; today: string; data: CardData; shared: SharedLossFacts }) {
  const lossPct = Math.abs(loss.lossPct);
  const recent = loss.recentBuy ? `${loss.recentIsSave ? "Saved" : "Bought"} ${dayWords(loss.recentBuy, today)}: a sale now may be a wash sale` : null;
  return (
    <CardShell
      lead={
        <>
          <CardHead ticker={loss.ticker} name={loss.name} call={loss.call} />
          <div>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className={`${NUM} text-[28px] font-semibold leading-8 tracking-[-0.02em] text-[var(--signal-bearish)]`}>−{usd(loss.loss)}</span>
              {loss.taxSaved >= 5 ? (
                <span className="text-[15px] text-oa-fg">
                  → <span className={`${NUM} font-medium`}>~{usd(loss.taxSaved)}</span> tax saved
                </span>
              ) : (
                <span className="text-[13px] text-oa-muted-fg">to set against gains</span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2" title={`${fmtShares(loss.shares)} shares cost ${usd(loss.cost)} and are worth ${usd(loss.value)}.`}>
              <span aria-hidden="true" className="relative h-2 flex-1 rounded-full bg-[color-mix(in_srgb,var(--oa-fg)_6%,transparent)]">
                <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--signal-bearish)]" style={{ width: `${Math.min(100, (lossPct / max) * 100)}%` }} />
              </span>
              <span className={`${NUM} shrink-0 text-[13px] font-medium text-[var(--signal-bearish)]`}>−{Math.round(lossPct)}%</span>
            </div>
          </div>
        </>
      }
      middle={
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={CHIP} title={`${fmtShares(loss.shares)} shares`}>
              {usd(loss.cost)} → {usd(loss.value)}
            </span>
            <span className={CHIP}>{termWord(loss)}</span>
            {loss.longTermOn ? <span className={CHIP}>Long term {dayWords(loss.longTermOn, today)}</span> : null}
            {loss.call === "Trim" && !shared.allFit ? <span className={CHIP}>Fits our call</span> : null}
            <Price data={data} />
          </div>
          {loss.similar.length > 0 ? (
            <div>
              <p className="oa-caption mb-1.5">Own meanwhile</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`${CHIP} text-oa-muted-fg`}>
                  <StockLogo ticker={loss.ticker} size={16} />
                  {loss.ticker}
                </span>
                <span aria-hidden="true" className="text-oa-muted-fg">
                  →
                </span>
                {loss.similar.slice(0, 3).map((pick) => (
                  <Link
                    key={pick.ticker}
                    href={`/stock/${encodeURIComponent(pick.ticker)}`}
                    prefetch={false}
                    title={pick.why}
                    className={`${CHIP} hover:border-oa-fg/40 ${FOCUS}`}
                  >
                    <StockLogo ticker={pick.ticker} size={16} />
                    {pick.ticker}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-oa-muted-fg">No look-alike {loss.fund ? "fund" : "stock"} on record.</p>
          )}
          <Trend data={data} />
        </>
      }
      side={
        loss.buyBackFrom !== shared.buyBackFrom || recent ? (
          <div className="mt-auto flex flex-col gap-2 border-t border-oa-border pt-2.5">
            {loss.buyBackFrom !== shared.buyBackFrom ? <WashWindow from={loss.buyBackFrom} today={today} /> : null}
            {recent ? <p className="text-[13px] leading-[18px] text-[var(--signal-bearish)]">{recent}</p> : null}
          </div>
        ) : null
      }
    />
  );
}

function capText(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(value >= 1e13 ? 0 : 1).replace(/\.0$/, "")}T`;
  if (value >= 1e9) return `$${Math.round(value / 1e9)}B`;
  return `$${Math.round(value / 1e6)}M`;
}

function signedWhole(value: number): string {
  const whole = Math.round(value);
  return `${whole > 0 ? "+" : whole < 0 ? "−" : ""}${Math.abs(whole)}%`;
}

/**
 * The biggest loss beside its look-alikes, as bars: each one's size and its move over the past year for stocks, or how
 * much of the two funds is the same companies for funds. Shown once, in the losses' companion panel.
 */
function LookAlikes({ loss }: { loss: LossIdea }) {
  if (loss.similar.length === 0) return null;
  if (loss.fund) {
    const rows = loss.similar.filter((pick) => typeof pick.overlap === "number");
    if (rows.length === 0) return null;
    return (
      <div>
        <p className="oa-caption mb-1.5">Funds like {loss.ticker}, by shared holdings</p>
        <ul role="list" className="flex flex-col gap-1.5">
          {rows.map((pick) => (
            <li key={pick.ticker} className="grid grid-cols-[4.75rem_minmax(0,1fr)_2.75rem] items-center gap-x-3 text-[13.5px]" title={pick.why}>
              <Ticker symbol={pick.ticker} size={18} />
              <span aria-hidden="true" className="relative h-2 rounded-full bg-[color-mix(in_srgb,var(--oa-fg)_6%,transparent)]">
                <span className="absolute inset-y-0 left-0 rounded-full bg-oa-primary" style={{ width: `${Math.min(100, pick.overlap ?? 0)}%` }} />
              </span>
              <span className={`${NUM} text-right text-oa-fg`}>{fmtPct(pick.overlap ?? 0)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const rows = [
    { ticker: loss.ticker, cap: loss.marketCap ?? null, year: loss.ret1y ?? null, own: true },
    ...loss.similar.map((pick) => ({ ticker: pick.ticker, cap: pick.marketCap ?? null, year: pick.ret1y ?? null, own: false })),
  ];
  const caps = rows.map((row) => row.cap ?? 0);
  const maxCap = Math.max(1, ...caps);
  const years = barGeometry(rows.map((row) => row.year ?? 0));
  return (
    <div>
      <div className="mb-1.5 grid grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 text-[13px] text-oa-muted-fg">
        <span className="whitespace-nowrap">Own meanwhile</span>
        <span>Size</span>
        <span>Past year</span>
      </div>
      <ul role="list" className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const bar = years.bars[index]!;
          return (
            <li key={row.ticker} className={`grid grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 text-[13px] ${row.own ? "text-oa-muted-fg" : ""}`}>
              <Ticker symbol={row.ticker} size={18} />
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="relative h-2 flex-1 rounded-full bg-[color-mix(in_srgb,var(--oa-fg)_6%,transparent)]">
                  {row.cap !== null ? (
                    <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(row.cap / maxCap) * 100}%`, background: row.own ? "var(--oa-muted-fg)" : "var(--oa-fg)", opacity: row.own ? 0.5 : 0.7 }} />
                  ) : null}
                </span>
                <span className={`${NUM} w-11 shrink-0 text-right text-oa-fg`}>{row.cap !== null ? capText(row.cap) : "—"}</span>
              </span>
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="relative h-2 flex-1 rounded-full bg-[color-mix(in_srgb,var(--oa-fg)_6%,transparent)]">
                  {row.year !== null ? (
                    <span
                      className="absolute inset-y-0 rounded-full"
                      style={{ left: `${bar.left}%`, width: `${Math.max(bar.width, 1)}%`, background: bar.negative ? "var(--signal-bearish)" : "var(--signal-bullish)" }}
                    />
                  ) : null}
                  {years.zero > 0 ? <span className="absolute -inset-y-0.5 w-px bg-oa-muted-fg" style={{ left: `${years.zero}%` }} /> : null}
                </span>
                <span className={`${NUM} w-11 shrink-0 text-right text-oa-fg`}>{row.year !== null ? signedWhole(row.year) : "—"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LossWatch({ losses }: { losses: LossIdea[] }) {
  const watched = losses.filter((loss) => loss.watch && loss.shares > 0);
  if (watched.length === 0) return null;
  const href = watched.length === 1 ? watched[0]!.watch!.href : watchDropsHref(watched.map((loss) => ({ ticker: loss.ticker, price: loss.value / loss.shares })), 5);
  if (!href) return null;
  return (
    <Link href={href} prefetch={false} className={`self-start rounded text-[13.5px] font-medium leading-5 text-oa-primary hover:underline ${FOCUS}`}>
      {watched.length === 1 ? watched[0]!.watch!.label : "Tell me if any of these falls another 5%"}
    </Link>
  );
}

/** What every loss on the list has in common, said once over the cards (owner rule 1). */
type SharedLossFacts = { buyBackFrom: string | null; allFit: boolean };

function sharedLossFacts(losses: readonly LossIdea[]): SharedLossFacts {
  const days = new Set(losses.map((loss) => loss.buyBackFrom));
  return {
    buyBackFrom: days.size === 1 ? losses[0]!.buyBackFrom : null,
    allFit: losses.length > 1 && losses.every((loss) => loss.call === "Trim"),
  };
}

function LossSection({ view, tail }: { view: IdeasData; tail: React.ReactNode }) {
  const { losses } = view;
  if (losses.length === 0) return null;
  const total = losses.reduce((sum, loss) => sum + loss.loss, 0);
  const saved = losses.reduce((sum, loss) => sum + loss.taxSaved, 0);
  const max = Math.max(10, ...losses.map((loss) => Math.abs(loss.lossPct) * 1.1));
  const shared = sharedLossFacts(losses);
  return (
    <section className="flex flex-col gap-3" aria-label="Losses you could sell for tax">
      <SectionHead title="Losses you could sell for tax" />
      <TaxAssumptions rates={view.rates} />
      {shared.buyBackFrom || shared.allFit ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-2 sm:px-0">
          {shared.buyBackFrom ? <WashWindow from={shared.buyBackFrom} today={view.today} /> : null}
          {shared.allFit ? <span className="text-[13px] text-oa-fg">Selling fits our Sell some call on each</span> : null}
        </div>
      ) : null}
      <div className="[container-type:inline-size]">
        <ul role="list" className={GRID}>
          {losses.map((loss) => (
            <LossCard key={loss.id} loss={loss} max={max} today={view.today} data={view.facts[loss.ticker]} shared={shared} />
          ))}
          {/* The rest of the last row: all the losses together, the one watch for them, and the method when it lands here. */}
          <Companion cards={losses.length}>
            <div>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={`${NUM} text-[28px] font-semibold leading-8 tracking-[-0.02em] text-[var(--signal-bearish)]`}>−{usd(total)}</span>
                <span className="text-[13px] text-oa-muted-fg">
                  {losses.length === 1 ? "in one holding" : `across ${losses.length} holdings`}
                </span>
              </div>
              {saved >= 5 ? (
                <p className="mt-1 text-[15px] text-oa-fg">
                  Up to <span className={`${NUM} font-medium`}>{usd(saved)}</span> less tax
                </p>
              ) : null}
            </div>
            <LookAlikes loss={losses[0]!} />
            {/* One watch for every loss on the list, not a link under each one (owner, Nov 11); the panel's foot. */}
            <div className="mt-auto flex flex-col gap-3">
              <LossWatch losses={losses} />
            </div>
            {tail}
          </Companion>
        </ul>
      </div>
    </section>
  );
}

/* ── The method, folded ──────────────────────────────────────────────── */

/** The method lives in the docs (owner rule 2: no hidden toggles): one muted line and a plain link to it. */
const METHOD_HREF = "/docs/portfolio/rebalancing-ideas#when-a-stock-is-too-big";

function Method() {
  return (
    // The companion's one spacer: the method sits at the panel's foot.
    <div className="mt-auto flex flex-col gap-1.5">
      <p className="text-[13px] text-oa-muted-fg">Ideas from the numbers, not advice.</p>
      <Link href={METHOD_HREF} prefetch={false} className={`w-fit rounded text-[13.5px] font-medium text-oa-primary hover:underline ${FOCUS}`}>
        How we work these out →
      </Link>
    </div>
  );
}

/* ── The page ────────────────────────────────────────────────────────── */

export function IdeasView({ view }: { view: IdeasData }) {
  const { plan } = view;
  const over = new Set(plan.companiesOver.map((row) => row.ticker));
  const top = topShare(view.weights);
  const max = chartMax([
    ...plan.trims.filter((trim) => trim.kind === "company").map((trim) => trim.before),
    ...plan.buyMoreOver.map((row) => row.pct),
    ...plan.adds.map((add) => add.after),
  ]);
  const moved = plan.trims.length > 0 || plan.adds.length > 0;
  const cards = plan.trims.length + plan.buyMoreOver.length + plan.adds.length;
  const leftOut = plan.moreOver.length + plan.unsized.length + plan.fundOnly.length + plan.small.length;
  return (
    <div className="flex flex-col gap-6">
      <div className={`grid gap-3 lg:items-stretch ${view.sectors.length > 0 ? "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]" : ""}`}>
        <ConcentrationPanel
          title={concentrationTitle(plan)}
          chip={top ? `Top ${top.count} = ${fmtPct(top.pct)}` : null}
          rows={view.weights}
          funds={view.funds}
          over={over}
        />
        {view.sectors.length > 0 ? <SectorPanel rows={view.sectors} moved={moved} /> : null}
      </div>
      {/* The method goes in the first grid's companion; with no losses there is no losses section at all. */}
      <IdeaCards
        view={view}
        max={max}
        ratesHere={view.losses.length === 0 && plan.trims.some((trim) => trim.tax !== null)}
        tail={
          cards > 0 || leftOut > 0 ? <Method /> : null
        }
      />
      <LossSection view={view} tail={cards > 0 || leftOut > 0 ? null : <Method />} />
      {cards === 0 && leftOut === 0 && view.losses.length === 0 ? (
        <div className="px-2 sm:px-0">
          <Method />
        </div>
      ) : null}
    </div>
  );
}
