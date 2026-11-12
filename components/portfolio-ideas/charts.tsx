import * as React from "react";

import { NUM, PairBar, Panel, ShowMore, Ticker } from "@/components/oa/kit";
import { SectorIcon } from "@/components/oa/sector-icon";
import { barGeometry } from "@/components/stock-report/fact-bars";
import type { StockFact } from "@/lib/portfolio-ideas/facts";
import { tickAligns, type FundRow, type SectorRow, type TickAlign, type WeightRow } from "@/lib/portfolio-ideas/mix";
import { COMPANY_LINE } from "@/lib/portfolio-ideas/rebalance";
import type { CallWord } from "@/lib/portfolio-ideas/types";
import { fmtPct } from "@/lib/portfolio-ideas/words";

/**
 * The pictures on /portfolio/ideas: the concentration chart (one bar per company, a line at 10%), the sectors before
 * and after the ideas, a card's weight bar, and the figure rows under each idea. Server components: plain divs.
 */

/** Our call's colour, the tones the call tags use: Buy more green, Sell some red, Keep and no call in quiet ink. */
export const CALL_FILL: Record<CallWord | "none", string> = {
  Add: "var(--signal-bullish)",
  Trim: "var(--signal-bearish)",
  Hold: "color-mix(in srgb, var(--oa-fg) 55%, transparent)",
  none: "color-mix(in srgb, var(--oa-fg) 30%, transparent)",
};

const TRACK = "bg-[color-mix(in_srgb,var(--oa-fg)_6%,transparent)]";
const LINE = "bg-oa-fg/70";

/** Where the chart's scale ends: past the biggest bar, and always far enough past the line that it sits inside. */
export function chartMax(values: number[]): number {
  return Math.max(COMPANY_LINE * 1.6, ...values.map((value) => value * 1.08));
}

const at = (value: number, max: number) => `${Math.min(100, Math.max(0, (value / max) * 100))}%`;

/* ── Concentration chart ─────────────────────────────────────────────── */

function WeightBar({ row, max, over }: { row: WeightRow; max: number; over: boolean }) {
  const fill = CALL_FILL[row.call ?? "none"];
  return (
    <span className={`relative block h-3 w-full rounded-[3px] ${TRACK}`}>
      {/* The part held directly, solid; the part through funds after it, lighter. Under the line both are dimmed. */}
      <span className="absolute inset-y-0 left-0 rounded-l-[3px]" style={{ width: at(row.directPct, max), background: fill, opacity: over ? 1 : 0.45 }} />
      {row.fundPct >= 0.05 ? (
        <span
          className="absolute inset-y-0"
          style={{ left: at(row.directPct, max), width: at(row.fundPct, max), background: fill, opacity: over ? 0.4 : 0.2 }}
        />
      ) : null}
      <span aria-hidden="true" className={`absolute -inset-y-1 w-px ${LINE}`} style={{ left: at(COMPANY_LINE, max) }} />
    </span>
  );
}

function FundBar({ row, max }: { row: FundRow; max: number }) {
  return (
    <span className={`relative block h-3 w-full rounded-[3px] ${TRACK}`}>
      <span className="absolute inset-y-0 left-0 rounded-l-[3px] bg-[color-mix(in_srgb,var(--oa-fg)_22%,transparent)]" style={{ width: at(row.pct, max) }} />
    </span>
  );
}

const ROW = "grid grid-cols-[4.75rem_minmax(0,1fr)_2.75rem] items-center gap-x-3";

function CallKey({ calls, noCall, funds }: { calls: Set<CallWord>; noCall: boolean; funds: boolean }) {
  const items: Array<[string, string]> = [];
  if (calls.has("Add")) items.push(["Buy more", CALL_FILL.Add]);
  if (calls.has("Hold")) items.push(["Keep", CALL_FILL.Hold]);
  if (calls.has("Trim")) items.push(["Sell some", CALL_FILL.Trim]);
  if (noCall && items.length > 0) items.push(["No call", CALL_FILL.none]);
  if (items.length === 0 && !funds) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-oa-muted-fg">
      {items.map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ background: color }} />
          {label}
        </span>
      ))}
      {funds ? (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-[2px] bg-oa-muted-fg/40" />
          Via funds
        </span>
      ) : null}
    </span>
  );
}

/**
 * One bar per company held, biggest first, tinted by our call, with the 10% line through every bar. Companies over
 * the line are drawn at full strength; the rest are dimmed. The first `limit` show; the rest wait behind one toggle.
 */
export function ConcentrationPanel({
  title,
  chip,
  rows,
  funds,
  over,
  limit = 10,
}: {
  title: string;
  chip: string | null;
  rows: WeightRow[];
  funds: FundRow[];
  over: ReadonlySet<string>;
  limit?: number;
}) {
  // Scaled on the companies, so one big fund cannot squash them; a fund past the scale fills its track.
  const max = chartMax(rows.length > 0 ? rows.map((row) => row.pct) : funds.map((fund) => fund.pct));
  const calls = new Set(rows.map((row) => row.call).filter((call): call is CallWord => call !== null));
  const noCall = rows.some((row) => row.call === null);
  const viaFunds = rows.some((row) => row.fundPct >= 0.05 && row.directPct > 0);
  const line = (row: WeightRow) => (
    <li
      key={row.ticker}
      className={ROW}
      title={`${row.name}: ${fmtPct(row.pct)}${row.fundPct >= 0.5 ? `, ${fmtPct(row.fundPct)} of it through funds` : ""}`}
    >
      <Ticker symbol={row.ticker} size={18} className={over.has(row.ticker) ? "font-semibold" : ""} />
      <WeightBar row={row} max={max} over={over.has(row.ticker)} />
      <span className={`${NUM} text-right text-[13.5px] ${over.has(row.ticker) ? "font-semibold text-oa-fg" : "text-oa-muted-fg"}`}>{fmtPct(row.pct)}</span>
    </li>
  );
  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit);
  return (
    <Panel fill className="h-full">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="text-[17px] font-semibold leading-6 tracking-[-0.01em] text-oa-fg">{title}</h2>
          {chip ? <span className={`${NUM} rounded-full border border-oa-border bg-oa-bg px-2.5 py-0.5 text-[13px] text-oa-fg`}>{chip}</span> : null}
        </div>
        <CallKey calls={calls} noCall={noCall} funds={viaFunds} />
      </div>
      <div className={`${ROW} mt-4 text-[13px] text-oa-muted-fg`} aria-hidden="true">
        <span />
        <span className="relative h-4">
          <span className="absolute -translate-x-1/2 font-medium text-oa-fg" style={{ left: at(COMPANY_LINE, max) }}>
            {COMPANY_LINE}%
          </span>
        </span>
        <span />
      </div>
      <ul role="list" aria-label="Each company's share of the portfolio" className="mt-1.5 flex flex-1 flex-col justify-between gap-2.5">
        {shown.map(line)}
      </ul>
      {rest.length > 0 ? (
        <ShowMore always label={`Show ${rest.length} more`} className="mt-2.5">
          <ul role="list" className="flex flex-col gap-2.5">
            {rest.map(line)}
          </ul>
        </ShowMore>
      ) : null}
      {funds.length > 0 ? (
        <>
          <p className="oa-caption mt-4">Funds</p>
          <ul role="list" aria-label="Each fund's share of the portfolio" className="mt-2 flex flex-col gap-2.5">
            {funds.map((fund) => (
              <li key={fund.ticker} className={ROW} title={fund.name}>
                <Ticker symbol={fund.ticker} size={18} />
                <FundBar row={fund} max={max} />
                <span className={`${NUM} text-right text-[13.5px] text-oa-muted-fg`}>{fmtPct(fund.pct)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Panel>
  );
}

/* ── Sectors ─────────────────────────────────────────────────────────── */

const SECTOR_SHORT: Record<string, string> = {
  Technology: "Tech",
  "Communication Services": "Media",
  "Consumer Discretionary": "Consumer",
  "Consumer Staples": "Staples",
  "Health Care": "Health care",
  "Real Estate": "Real estate",
};

export function sectorWord(sector: string): string {
  return SECTOR_SHORT[sector] ?? sector;
}

/**
 * Each sector's share against the S&P 500's (a tick on the track), and, when the ideas move it, where they would
 * leave it: the part they move light, the part they keep solid.
 */
export function SectorPanel({ rows, moved, limit = 11 }: { rows: SectorRow[]; moved: boolean; limit?: number }) {
  const shown = rows.slice(0, limit);
  const max = Math.max(1, ...shown.map((row) => Math.max(row.pct, row.after, row.benchmark ?? 0) * 1.08));
  const changed = (row: SectorRow) => moved && Math.abs(row.after - row.pct) >= 0.3;
  const bench = shown.some((row) => row.benchmark !== null);
  return (
    <Panel fill className="h-full">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-[17px] font-semibold leading-6 tracking-[-0.01em] text-oa-fg">{moved ? "Sectors, now and after" : bench ? "Sectors against the S&P 500" : "Sectors"}</h2>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-oa-muted-fg">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-[2px] bg-oa-primary" />
            Yours
          </span>
          {moved ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2 rounded-[2px] bg-oa-primary/35" />
              Moved
            </span>
          ) : null}
          {bench ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-3 w-px bg-oa-fg" />
              S&amp;P 500
            </span>
          ) : null}
        </span>
      </div>
      <ul role="list" aria-label="Each sector's share of the portfolio" className="mt-4 flex flex-1 flex-col justify-between gap-2.5">
        {shown.map((row) => {
          const move = changed(row);
          return (
            <li
              key={row.sector}
              className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-x-3"
              title={`${row.sector}: ${fmtPct(row.pct)}${row.benchmark !== null ? ` against ${fmtPct(row.benchmark)} of the S&P 500` : ""}${move ? `, ${fmtPct(row.after)} after the ideas` : ""}`}
            >
              <span className="flex min-w-0 items-center gap-2 text-[13.5px] text-oa-fg">
                <SectorIcon id={row.sector} size={16} className="shrink-0 text-oa-muted-fg" />
                <span className="truncate">{sectorWord(row.sector)}</span>
              </span>
              <span className={`relative block h-3 w-full rounded-[3px] ${TRACK}`}>
                {/* The part the ideas move is light, the part they keep solid; the figures say which way. */}
                {move ? <span className="absolute inset-y-0 left-0 rounded-l-[3px] bg-oa-primary/35" style={{ width: at(Math.max(row.pct, row.after), max) }} /> : null}
                <span className="absolute inset-y-0 left-0 rounded-l-[3px] bg-oa-primary" style={{ width: at(move ? Math.min(row.pct, row.after) : row.pct, max) }} />
                {row.benchmark !== null ? <span aria-hidden="true" className="absolute -inset-y-1 w-0.5 rounded-full bg-oa-fg" style={{ left: at(row.benchmark, max) }} /> : null}
              </span>
              <span className={`${NUM} whitespace-nowrap text-right text-[13.5px] text-oa-fg`}>
                {move ? (
                  <>
                    <span className="text-oa-muted-fg">{fmtPct(row.pct)} → </span>
                    {fmtPct(row.after)}
                  </>
                ) : (
                  fmtPct(row.pct)
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ── A card's weight ─────────────────────────────────────────────────── */

/**
 * A card's share of the portfolio on one track, with the line the idea aims for (10% for a company). With `after`,
 * the part the idea changes is drawn light, the part it keeps solid: a trim's light part is what it sells, an add's
 * is what it buys. The figures beside the bar say which way it goes.
 */
export function WeightTrack({ before, after, max, fill, line = COMPANY_LINE }: { before: number; after?: number; max: number; fill: string; line?: number }) {
  const end = after ?? before;
  const pos = Math.min(100, Math.max(0, (line / max) * 100));
  const [align] = tickAligns([pos]);
  return (
    <span aria-hidden="true" className="block">
      <span className={`relative block h-2 w-full rounded-full ${TRACK}`}>
        {after !== undefined ? <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: at(Math.max(before, after), max), background: fill, opacity: 0.3 }} /> : null}
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: at(Math.min(before, end), max), background: fill }} />
        <span className={`absolute -inset-y-1 w-px ${LINE}`} style={{ left: `${pos}%` }} />
      </span>
      {/* The line says its level (council, Nov 12: never an unlabelled tick). */}
      <span className="relative mt-1 block h-4">
        <span className={`${NUM} absolute top-0 whitespace-nowrap text-[13px] leading-4 text-oa-muted-fg ${ALIGN[align!]}`} style={{ left: `${pos}%` }}>
          {fmtPct(line)}
        </span>
      </span>
    </span>
  );
}

/* ── The why, as figures ─────────────────────────────────────────────── */

function signed(value: number, digits = 1): string {
  const size = Math.abs(value);
  const text = size >= 10 ? Math.round(size).toString() : size.toFixed(digits).replace(/\.0$/, "");
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${text}%`;
}

function times(value: number): string {
  return `${value >= 10 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, "")}×`;
}

function capFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Sales growth on a signed track, with a tick at each bar the call is measured against. */
/** A threshold as printed under its tick: "17%", "−5%". */
function pctText(value: number): string {
  return `${value < 0 ? "−" : ""}${Math.abs(value)}%`;
}

const ALIGN: Record<TickAlign, string> = { start: "", center: "-translate-x-1/2", end: "-translate-x-full" };

function SalesFact({ value, marks }: { value: number; marks: Array<{ value: number; label: string }> }) {
  const { zero, bars } = barGeometry([value, ...marks.map((mark) => mark.value)]);
  const bar = bars[0]!;
  const color = value >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)";
  const ticks = marks
    .map((mark, index) => {
      const geo = bars[index + 1]!;
      return { mark, pos: geo.negative ? geo.left : geo.left + geo.width };
    })
    .sort((a, b) => a.pos - b.pos);
  // Two ticks too close for two labels share one, between them: "9% · 12%".
  const merged = ticks.length === 2 && ticks[1]!.pos - ticks[0]!.pos < 25;
  const labels = merged
    ? [{ key: "both", pos: (ticks[0]!.pos + ticks[1]!.pos) / 2, text: `${pctText(ticks[0]!.mark.value)} · ${pctText(ticks[1]!.mark.value)}` }]
    : ticks.map((tick) => ({ key: tick.mark.label, pos: tick.pos, text: pctText(tick.mark.value) }));
  const aligns = tickAligns(labels.map((label) => label.pos));
  return (
    <div
      className="grid grid-cols-[5.5rem_minmax(2.5rem,1fr)_auto] items-center gap-x-2 gap-y-0.5"
      role="img"
      aria-label={`Sales growth ${signed(value)}${marks.length ? `; bars at ${marks.map((mark) => `${mark.value}%`).join(" and ")}` : ""}`}
    >
      <span aria-hidden="true" className="truncate text-[13px] text-oa-muted-fg">
        Sales growth
      </span>
      <span aria-hidden="true" className={`relative h-2 rounded-full ${TRACK}`}>
        <span className="absolute inset-y-0 rounded-full" style={{ left: `${bar.left}%`, width: `${Math.max(bar.width, 1)}%`, background: color }} />
        {zero > 0 ? <span className="absolute -inset-y-0.5 w-px bg-oa-muted-fg" style={{ left: `${zero}%` }} /> : null}
        {ticks.map((tick) => (
          <span key={tick.mark.label} className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-oa-fg" style={{ left: `${tick.pos}%` }} />
        ))}
      </span>
      <span aria-hidden="true" className={`${NUM} text-right text-[13px] font-medium text-oa-fg`}>
        {signed(value)}
      </span>
      {ticks.length > 0 ? (
        <>
          {/* Every tick says its level (council, Nov 12: never an unlabelled tick). */}
          <span aria-hidden="true" />
          <span aria-hidden="true" className="relative h-4">
            {labels.map((label, index) => (
              <span
                key={label.key}
                className={`${NUM} absolute top-0 whitespace-nowrap text-[13px] leading-4 text-oa-fg ${ALIGN[aligns[index]!]}`}
                style={{ left: `${label.pos}%` }}
              >
                {label.text}
              </span>
            ))}
          </span>
          <span aria-hidden="true" />
        </>
      ) : null}
    </div>
  );
}

export function FactRow({ fact, ticker }: { fact: StockFact; ticker: string }) {
  if (fact.kind === "sales") return <SalesFact value={fact.value} marks={fact.marks} />;
  if (fact.kind === "move")
    return (
      <div>
        <p className="oa-caption mb-1">Past 5 days</p>
        <PairBar value={fact.value} versus={fact.peer} labels={[ticker, capFirst(fact.peerLabel)]} texts={[signed(fact.value), signed(fact.peer)]} className="text-[13px]" />
      </div>
    );
  return (
    <div>
      <p className="oa-caption mb-1">P/E against its usual</p>
      <PairBar value={fact.value} versus={fact.usual} labels={["Now", "Usual"]} texts={[times(fact.value), times(fact.usual)]} className="text-[13px]" />
    </div>
  );
}
