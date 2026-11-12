import { StockLogo } from "@/components/stock-logo";
import type { ShareBars, ShareCard, ShareChip, ShareCurve, ShareTone } from "@/lib/share/types";

/**
 * A share card on a page: the same parts, in the same order, as the image
 * (lib/share/og.tsx): the big number, the short headline, the picture, the
 * stocks as logo chips, then the site and where the numbers come from. Used by
 * the preview before sharing and by the public page at /s/{id}. No hooks, so
 * it renders on either side; colours come from the app's tokens, so it follows
 * the light or dark theme. A card saved before cards had a big number shows the
 * words-only layout.
 */

function toneText(tone: ShareTone): string {
  return tone === "up" ? "text-signal-bullish" : tone === "down" ? "text-signal-bearish" : "text-oa-fg";
}

function toneFill(tone: ShareTone): string {
  return tone === "up" ? "bg-signal-bullish" : tone === "down" ? "bg-signal-bearish" : "bg-oa-fg";
}

const TONE_VAR: Record<ShareTone, string> = { up: "var(--signal-bullish)", down: "var(--signal-bearish)", flat: "var(--oa-primary)" };

function toneOf(value: number): ShareTone {
  return Math.abs(value) < 0.05 ? "flat" : value > 0 ? "up" : "down";
}

function signedPct(value: number): string {
  const text = Math.abs(value).toFixed(1);
  return text === "0.0" ? "0.0%" : `${value > 0 ? "+" : "−"}${text}%`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function weekday(day: string): string {
  const date = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : WEEKDAYS[date.getUTCDay()]!;
}

/** "S&P 500" never breaks across lines. */
function keep(text: string): string {
  return text.replace(/S&P 500/g, "S&P 500");
}

function Glyph({ tone }: { tone: ShareTone }) {
  if (tone === "flat") return <span aria-hidden className="mt-[7px] inline-block size-1.5 shrink-0 rounded-full bg-oa-primary" />;
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`mt-[3px] size-3.5 shrink-0 ${toneText(tone)}`}>
      <path d={tone === "up" ? "M12 4 L21 19 L3 19 Z" : "M3 5 L21 5 L12 20 Z"} fill="currentColor" />
    </svg>
  );
}

function RowLabel({ label, ticker, bold }: { label: string; ticker?: string | null; bold?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {ticker ? <StockLogo ticker={ticker} size={20} atOnce /> : null}
      <span className={`truncate text-[14px] leading-5 text-oa-fg ${bold ? "font-semibold" : ""}`}>{label}</span>
    </span>
  );
}

function Bars({ bars }: { bars: ShareBars }) {
  if (bars.style === "months") {
    const max = Math.max(...bars.rows.map((row) => row.value), 0) || 1;
    const marked = bars.rows.some((row) => row.highlight);
    return (
      <figure className="flex flex-col gap-2">
        <figcaption className="text-[13px] leading-5 text-oa-muted-fg">{bars.title}</figcaption>
        <div className="flex h-32 items-end gap-1" role="list">
          {bars.rows.map((row, index) => (
            <div key={index} role="listitem" className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" aria-label={`${row.label}${row.display ? ` ${row.display}` : ""}`}>
              {row.highlight && row.display ? <span className="oa-mono text-[10.5px] leading-none text-oa-primary">{row.display}</span> : null}
              <div
                className={`w-full rounded-[3px] ${row.value <= 0 ? "bg-oa-border" : row.highlight || !marked ? "bg-oa-primary" : "bg-oa-primary/35"}`}
                style={{ height: `${Math.max(row.value > 0 ? 5 : 2, Math.round((row.value / max) * 82))}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-1" aria-hidden>
          {bars.rows.map((row, index) => (
            <span key={index} className={`oa-mono min-w-0 flex-1 text-center text-[11px] ${row.highlight ? "text-oa-fg" : "text-oa-muted-fg"}`}>
              {row.label}
            </span>
          ))}
        </div>
      </figure>
    );
  }

  if (bars.style === "signed") {
    const rows = bars.rows.slice(0, 6);
    const max = Math.max(...rows.map((row) => Math.abs(row.value)), 0) || 1;
    return (
      <figure className="flex flex-col gap-2.5">
        <figcaption className="text-[13px] leading-5 text-oa-muted-fg">{bars.title}</figcaption>
        <ul className="flex flex-col gap-1.5">
          {rows.map((row, index) => {
            const width = `${Math.max(3, Math.round((Math.abs(row.value) / max) * 100))}%`;
            return (
              <li key={index} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3rem] items-center gap-2">
                <RowLabel label={row.label} ticker={row.ticker} bold={row.highlight} />
                <div className="grid h-5 grid-cols-2 items-center" aria-hidden>
                  <div className="flex h-full items-center justify-end border-r border-oa-border">
                    {row.value < 0 ? <div className={`h-2.5 rounded-l-[3px] ${toneFill(row.tone)}`} style={{ width }} /> : null}
                  </div>
                  <div className="flex h-full items-center">{row.value > 0 ? <div className={`h-2.5 rounded-r-[3px] ${toneFill(row.tone)}`} style={{ width }} /> : null}</div>
                </div>
                <span className={`oa-mono text-right text-[13px] tabular-nums ${toneText(row.tone)}`}>{row.display}</span>
              </li>
            );
          })}
        </ul>
      </figure>
    );
  }

  const versus = bars.style === "versus";
  const rows = bars.rows.slice(0, versus ? 2 : 5);
  const max = Math.max(...rows.map((row) => Math.max(Math.abs(row.value), row.benchmark ?? 0)), 0) || 1;
  const benchmarked = rows.some((row) => row.benchmark != null);
  return (
    <figure className="flex flex-col gap-2.5">
      <figcaption className="text-[13px] leading-5 text-oa-muted-fg">{bars.title}</figcaption>
      <ul className={`flex flex-col ${versus ? "gap-3" : "gap-2"}`}>
        {rows.map((row, index) => {
          const fill = versus
            ? row.tone === "flat"
              ? row.highlight
                ? "bg-oa-primary"
                : "bg-oa-muted-fg"
              : toneFill(row.tone)
            : row.highlight
              ? "bg-oa-primary"
              : "bg-oa-primary/35";
          return (
            <li key={index} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <RowLabel label={row.label} ticker={row.ticker} bold={row.highlight} />
                {row.display ? (
                  <span className={`oa-mono shrink-0 tabular-nums ${versus ? `text-[16px] ${toneText(row.tone)}` : "text-[13px] text-oa-fg"}`}>{row.display}</span>
                ) : null}
              </div>
              <div className={`relative w-full rounded-full bg-oa-bg ${versus ? "h-3" : "h-2"}`}>
                <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.max(3, Math.round((Math.abs(row.value) / max) * 100))}%` }} />
                {row.benchmark != null ? (
                  <span aria-hidden className="absolute -top-1 h-4 w-[3px] -translate-x-1/2 rounded-full bg-oa-fg" style={{ left: `${Math.round((row.benchmark / max) * 100)}%` }} />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {benchmarked ? (
        <p className="flex items-center gap-1.5 text-[12px] text-oa-muted-fg">
          <span aria-hidden className="inline-block h-3 w-[3px] rounded-full bg-oa-fg" />
          S&amp;P 500 share
        </p>
      ) : null}
    </figure>
  );
}

/** The week's line against the S&P 500, each line labelled at its end. */
function Curve({ curve }: { curve: ShareCurve }) {
  const W = 520;
  const H = 230;
  const plotW = 400;
  const pad = 12;
  const all = [...curve.mine, ...(curve.market ?? []), 0];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (index: number, count: number) => pad + (index / Math.max(1, count - 1)) * (plotW - pad * 2);
  const y = (value: number) => pad + (1 - (value - lo) / span) * (H - 34 - pad * 2);
  const path = (series: number[]) => series.map((value, index) => `${index === 0 ? "M" : "L"}${x(index, series.length).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const mineEnd = curve.mine[curve.mine.length - 1]!;
  const marketEnd = curve.market ? curve.market[curve.market.length - 1]! : null;
  const mineColor = TONE_VAR[toneOf(mineEnd)];
  // End labels (figure on top, name under it) sit beside each line's end, 50 apart and inside the plot.
  const top = 22;
  const bottom = H - 34 - 22;
  const inside = (value: number) => Math.max(top, Math.min(bottom, value));
  let mineY = inside(y(mineEnd));
  let marketY = marketEnd !== null ? inside(y(marketEnd)) : 0;
  if (marketEnd !== null && Math.abs(mineY - marketY) < 50) {
    const mid = Math.max(top + 25, Math.min(bottom - 25, (mineY + marketY) / 2));
    mineY = mineEnd >= marketEnd ? mid - 25 : mid + 25;
    marketY = mineEnd >= marketEnd ? mid + 25 : mid - 25;
  }
  const last = curve.mine.length - 1;
  const area = `${path(curve.mine)} L${x(last, curve.mine.length).toFixed(1)},${y(0).toFixed(1)} L${x(0, curve.mine.length).toFixed(1)},${y(0).toFixed(1)} Z`;
  const label = `My holdings ${signedPct(mineEnd)}${marketEnd !== null ? `, S&P 500 ${signedPct(marketEnd)}` : ""}`;
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-[13px] leading-5 text-oa-muted-fg">{curve.title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        <path d={area} style={{ fill: mineColor, opacity: 0.1 }} />
        <line x1={pad} x2={plotW - pad} y1={y(0)} y2={y(0)} strokeWidth={1.5} strokeDasharray="5 5" style={{ stroke: "var(--oa-border)" }} />
        {curve.market ? <path d={path(curve.market)} fill="none" strokeWidth={3} strokeDasharray="8 6" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--oa-muted-fg)" }} /> : null}
        <path d={path(curve.mine)} fill="none" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: mineColor }} />
        <circle cx={x(last, curve.mine.length)} cy={y(mineEnd)} r={6} style={{ fill: mineColor }} />
        {curve.market && marketEnd !== null ? <circle cx={x(curve.market.length - 1, curve.market.length)} cy={y(marketEnd)} r={4.5} style={{ fill: "var(--oa-muted-fg)" }} /> : null}
        <text x={plotW + 10} y={mineY + 2} className="oa-mono" fontSize={22} style={{ fill: mineColor }}>
          {signedPct(mineEnd)}
        </text>
        <text x={plotW + 10} y={mineY + 19} fontSize={14} style={{ fill: "var(--oa-muted-fg)" }}>
          My holdings
        </text>
        {marketEnd !== null ? (
          <>
            <text x={plotW + 10} y={marketY + 2} className="oa-mono" fontSize={19} style={{ fill: "var(--oa-muted-fg)" }}>
              {signedPct(marketEnd)}
            </text>
            <text x={plotW + 10} y={marketY + 19} fontSize={14} style={{ fill: "var(--oa-muted-fg)" }}>
              S&amp;P 500
            </text>
          </>
        ) : null}
        {curve.days.map((day, index) => (
          <text key={index} x={x(index, curve.days.length)} y={H - 8} textAnchor="middle" className="oa-mono" fontSize={14} style={{ fill: "var(--oa-muted-fg)" }}>
            {weekday(day)}
          </text>
        ))}
      </svg>
    </figure>
  );
}

function Chips({ chips }: { chips: ShareChip[] }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Holdings that moved">
      {chips.slice(0, 6).map((chip, index) => (
        <li key={index} className="flex items-center gap-2 rounded-lg border border-oa-border bg-oa-card py-1 pl-1 pr-2.5">
          {chip.ticker ? <StockLogo ticker={chip.ticker} size={24} atOnce /> : <span aria-hidden className="w-1" />}
          <span className={`text-[13.5px] text-oa-fg ${chip.ticker ? "oa-mono" : ""}`}>{chip.label}</span>
          <span className={`oa-mono text-[13.5px] tabular-nums ${toneText(chip.tone)}`}>{chip.display}</span>
        </li>
      ))}
    </ul>
  );
}

function Brand({ topic }: { topic: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-3.5 sm:px-6 sm:pt-4">
      <span className="flex items-center gap-1.5 text-[15px] font-semibold tracking-[-0.01em] text-oa-fg">
        <svg aria-hidden viewBox="0 0 56 56" fill="none" className="size-[18px]">
          <path d="M38 10C26.5 10 17.4 14.8 15.6 23.3C14.1 30.1 16.8 35.8 22.2 38.2" stroke="currentColor" strokeWidth="7.5" strokeLinecap="round" />
          <path d="M27.3 22.4C31.2 18.2 36.9 20.8 39 26.2C42.8 36.1 35.5 45.2 24.3 46C21 46.2 18 46 14.8 45.5" stroke="currentColor" strokeWidth="7.5" strokeLinecap="round" />
        </svg>
        stocksbrew
      </span>
      <span className="truncate text-[13.5px] text-oa-muted-fg">{topic}</span>
    </div>
  );
}

function Footer({ card, path }: { card: ShareCard; path?: string | null }) {
  return (
    <div className="mx-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-oa-border py-2.5 sm:mx-6">
      <span className="oa-mono text-[12px] text-oa-fg">stocksbrew.online{path ?? ""}</span>
      <span className="oa-mono text-[11.5px] leading-4 text-oa-muted-fg">{card.footnote}</span>
    </div>
  );
}

function Panel({ card }: { card: ShareCard }) {
  if (card.curve) return <Curve curve={card.curve} />;
  if (card.bars) return <Bars bars={card.bars} />;
  return null;
}

export function ShareCardView({ card, path, className = "" }: { card: ShareCard; path?: string | null; className?: string }) {
  const figure = card.figure;
  const panel = Boolean(card.curve || card.bars);

  if (!figure) {
    // A card saved before cards had a big number.
    return (
      <article className={`relative flex flex-col overflow-hidden rounded-xl border border-oa-border bg-oa-page ${className}`} aria-label="Share card">
        <Brand topic={card.topic} />
        <div className={`grid gap-5 px-4 py-5 sm:px-6 sm:py-6 ${card.bars ? "md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:items-center" : ""}`}>
          <div className="flex min-w-0 flex-col gap-3">
            <p className="text-balance text-[22px] font-bold leading-[1.15] tracking-[-0.02em] text-oa-fg sm:text-[28px]">{keep(card.headline)}</p>
            {card.lines.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {card.lines.map((line, index) => (
                  <li key={index} className="flex items-start gap-2 text-pretty text-[14px] leading-5 text-oa-muted-fg sm:text-[15px]">
                    <Glyph tone={line.tone} />
                    <span>{line.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {card.bars ? (
            <div className="min-w-0 rounded-lg border border-oa-border bg-oa-card p-3 sm:p-4">
              <Bars bars={card.bars} />
            </div>
          ) : null}
        </div>
        <Footer card={card} path={path} />
      </article>
    );
  }

  const chips = card.chips ?? [];
  // Same rule as the image: the one supporting line shows when there are no chips and the headline is short enough.
  const line = card.lines[0] && chips.length === 0 && card.headline.length <= 95 ? card.lines[0] : null;
  return (
    <article className={`relative flex flex-col overflow-hidden rounded-xl border border-oa-border bg-oa-page ${className}`} aria-label="Share card">
      <Brand topic={card.topic} />
      <div className={`grid gap-5 px-4 pb-4 pt-4 sm:px-6 sm:pb-5 ${panel ? "md:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] md:items-center" : ""}`}>
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <p className={`text-[52px] font-bold leading-none tracking-[-0.045em] sm:text-[64px] ${figure.tone === "flat" ? "text-oa-fg" : toneText(figure.tone)}`}>{figure.value}</p>
            <p className="text-pretty text-[15px] leading-5 text-oa-muted-fg">{keep(figure.label)}</p>
          </div>
          <p className="text-pretty text-[19px] font-semibold leading-[1.25] tracking-[-0.01em] text-oa-fg sm:text-[21px]">{keep(card.headline)}</p>
          {line ? (
            <p className="flex items-start gap-2 text-pretty text-[14px] leading-5 text-oa-muted-fg">
              <Glyph tone={line.tone} />
              <span>{line.text}</span>
            </p>
          ) : null}
        </div>
        {panel ? (
          <div className="min-w-0 rounded-lg border border-oa-border bg-oa-card p-3 sm:p-4">
            <Panel card={card} />
          </div>
        ) : null}
      </div>
      {chips.length > 0 ? (
        <div className="px-4 pb-4 sm:px-6">
          <Chips chips={chips} />
        </div>
      ) : null}
      <Footer card={card} path={path} />
    </article>
  );
}
