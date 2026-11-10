/**
 * The share cards, drawn with Satori (`next/server` ImageResponse) at
 * 1200x630 in the brew style: cream paper, espresso ink, one copper accent,
 * Instrument Sans for words and Geist Mono for numbers, tickers and labels.
 * Green and red only ever mean a gain or a loss.
 *
 * Every card is a pure function of an `OgCard` spec built in `lib/og/data.ts`
 * from real data. A field the data cannot fill is null, and the card leaves
 * that part out instead of drawing a placeholder.
 *
 * Satori notes: every element with more than one child needs `display: flex`,
 * there are no CSS variables, and text is not clamped for us, so long text is
 * cut in `fit()` before it gets here.
 */

import type * as React from "react";

import type {
  OgCard,
  OgCompareCard,
  OgLandingCard,
  OgLine,
  OgListCard,
  OgQuote,
  OgQuoteCard,
  OgReadCard,
  OgRecordCard,
  OgStat,
  OgTextCard,
  OgTone,
} from "@/lib/og/types";
import { OG_HEIGHT, OG_WIDTH } from "@/lib/og/url";

export const C = {
  page: "#f0eadd",
  card: "#fffdf9",
  well: "#f4efe4",
  ink: "#1c1915",
  muted: "#564f44",
  faint: "#8a8173",
  border: "#dcd4c4",
  copper: "#9a4816",
  copperTint: "#f3e4d6",
  up: "#1f6b45",
  upTint: "#e2eee5",
  down: "#b3261e",
  downTint: "#f6e1dd",
} as const;

const SANS = "Instrument Sans";
const MONO = "Geist Mono";
const PAD_X = 64;

/* ── text helpers ───────────────────────────────────────────────────────── */

/**
 * Cut text to `max` characters, preferring a whole sentence or clause so a
 * card never ends mid-thought: "A. B." keeps "A." when both do not fit, and
 * "A; B" keeps "A." Only when even the first clause is too long does it cut on
 * a word with an ellipsis.
 */
export function fit(text: string | null | undefined, max: number): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const head = clean.slice(0, max + 1);
  // The last sentence end (". ", "! ", "? ") or clause break ("; ") inside the limit.
  let best = -1;
  for (const match of head.matchAll(/[.!?](?=\s)|;(?=\s)/g)) {
    if (match.index !== undefined && match.index >= max * 0.45 && match.index < max) best = match.index;
  }
  if (best > 0) return `${clean.slice(0, best).replace(/[\s,;:]+$/, "")}.`;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, "")}…`;
}

/** A headline size that keeps long text inside the card. */
export function headlineSize(text: string, steps: Array<[number, number]>, smallest: number): number {
  for (const [maxChars, size] of steps) if (text.length <= maxChars) return size;
  return smallest;
}

function toneColor(tone: OgTone | undefined): string {
  return tone === "up" ? C.up : tone === "down" ? C.down : C.ink;
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

export function Mark({ size = 36, color = C.ink }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" style={{ display: "flex" }}>
      <path d="M38 10C26.5 10 17.4 14.8 15.6 23.3C14.1 30.1 16.8 35.8 22.2 38.2" stroke={color} strokeWidth="7.5" strokeLinecap="round" />
      <path
        d="M27.3 22.4C31.2 18.2 36.9 20.8 39 26.2C42.8 36.1 35.5 45.2 24.3 46C21 46.2 18 46 14.8 45.5"
        stroke={color}
        strokeWidth="7.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ToneGlyph({ tone, size = 22 }: { tone: OgTone; size?: number }) {
  if (tone === "flat") {
    return (
      <div style={{ display: "flex", width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", width: size * 0.5, height: size * 0.5, borderRadius: 999, background: C.copper }} />
      </div>
    );
  }
  const d = tone === "up" ? "M12 4 L21 19 L3 19 Z" : "M3 5 L21 5 L12 20 Z";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "flex", flexShrink: 0 }}>
      <path d={d} fill={toneColor(tone)} />
    </svg>
  );
}

function Label({ children, color = C.copper, size = 20 }: { children: React.ReactNode; color?: string; size?: number }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: size, letterSpacing: "0.08em", textTransform: "uppercase", color, fontWeight: 500 }}>
      {children}
    </span>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: OgTone }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        fontFamily: MONO,
        fontSize: 22,
        color: tone ? toneColor(tone) : C.ink,
        background: C.card,
        border: `1.5px solid ${C.border}`,
        borderRadius: 8,
        padding: "4px 12px",
      }}
    >
      {children}
    </div>
  );
}

const CALL_STYLE: Record<string, { bg: string; fg: string }> = {
  Add: { bg: C.upTint, fg: C.up },
  Trim: { bg: C.downTint, fg: C.down },
  Hold: { bg: C.copperTint, fg: C.copper },
};

export function CallPill({ call, size = 26, prefix = "Our call" }: { call: string; size?: number; prefix?: string | null }) {
  const style = CALL_STYLE[call] ?? CALL_STYLE.Hold;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: style.bg,
        color: style.fg,
        borderRadius: 999,
        padding: `${Math.round(size * 0.3)}px ${Math.round(size * 0.75)}px`,
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: size,
        flexShrink: 0,
      }}
    >
      {prefix ? <span style={{ fontWeight: 600, opacity: 0.8 }}>{prefix}</span> : null}
      <span>{call}</span>
    </div>
  );
}

function Logo({ ticker, logo, size }: { ticker: string; logo: string | null; size: number }) {
  if (logo) {
    return (
      <div
        style={{
          display: "flex",
          width: size,
          height: size,
          borderRadius: size * 0.24,
          background: "#ffffff",
          border: `1.5px solid ${C.border}`,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} width={size * 0.78} height={size * 0.78} style={{ objectFit: "contain" }} alt="" />
      </div>
    );
  }
  const letters = ticker.replace(/[^A-Z0-9]/gi, "").slice(0, ticker.length > 4 ? 3 : 4);
  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: C.ink,
        color: C.page,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: MONO,
        fontSize: Math.round(size * (letters.length > 3 ? 0.26 : 0.32)),
        flexShrink: 0,
      }}
    >
      {letters}
    </div>
  );
}

/** A plain line chart of closes, green when the window ended higher, red when lower. */
export function Spark({ values, width, height, tone, benchmark }: { values: number[]; width: number; height: number; tone: OgTone; benchmark?: number[] | null }) {
  const all = benchmark && benchmark.length > 1 ? [...values, ...benchmark] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const pad = 6;
  const toPath = (series: number[]) =>
    series
      .map((value, index) => {
        const x = pad + (index / Math.max(1, series.length - 1)) * (width - pad * 2);
        const y = pad + (1 - (value - min) / span) * (height - pad * 2);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  const line = toPath(values);
  const area = `${line} L${(width - pad).toFixed(1)},${height} L${pad},${height} Z`;
  const color = tone === "down" ? C.down : tone === "up" ? C.up : C.ink;
  const tint = tone === "down" ? C.downTint : tone === "up" ? C.upTint : C.well;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "flex" }}>
      <path d={area} fill={tint} />
      {benchmark && benchmark.length > 1 ? <path d={toPath(benchmark)} stroke={C.faint} strokeWidth={3} fill="none" strokeDasharray="8 7" /> : null}
      <path d={line} stroke={color} strokeWidth={4.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── the frame every card shares ────────────────────────────────────────── */

function Frame({ eyebrow, path, footnote, children }: { eyebrow: string | null; path: string; footnote: string | null; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: "flex",
        flexDirection: "column",
        background: C.page,
        color: C.ink,
        fontFamily: SANS,
        position: "relative",
      }}
    >
      {/* the copper rule: the one accent, top edge */}
      <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: OG_WIDTH, height: 10, background: C.copper }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `40px ${PAD_X}px 0` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Mark size={38} />
          <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em" }}>stocksbrew</span>
        </div>
        {eyebrow ? <Label size={21}>{eyebrow}</Label> : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: `0 ${PAD_X}px` }}>{children}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          margin: `0 ${PAD_X}px`,
          padding: "18px 0 34px",
          borderTop: `1.5px solid ${C.border}`,
          gap: 24,
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 20, color: C.ink, flexShrink: 0 }}>{`stocksbrew.online${path === "/" ? "" : path}`}</span>
        {footnote ? (
          <span style={{ fontFamily: MONO, fontSize: 18, color: C.muted, textAlign: "right" }}>
            {fit(footnote, Math.max(24, Math.floor((OG_WIDTH - PAD_X * 2 - 24 - (17 + path.length) * 12.1) / 10.9)))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Lines({ lines, size = 28, max = 2, chars = 95 }: { lines: OgLine[]; size?: number; max?: number; chars?: number }) {
  if (lines.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {lines.slice(0, max).map((line, index) => (
        <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ display: "flex", marginTop: Math.round(size * 0.22) }}>
            <ToneGlyph tone={line.tone} size={Math.round(size * 0.8)} />
          </div>
          <span style={{ fontSize: size, lineHeight: 1.3, color: C.ink, flexShrink: 1 }}>{fit(line.text, chars)}</span>
        </div>
      ))}
    </div>
  );
}

function StatRow({ stats }: { stats: OgStat[] }) {
  if (stats.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 14 }}>
      {stats.slice(0, 4).map((stat, index) => (
        <div
          key={index}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            background: C.card,
            border: `1.5px solid ${C.border}`,
            borderRadius: 14,
            padding: "14px 18px",
            gap: 4,
          }}
        >
          <Label size={17} color={C.muted}>
            {stat.label}
          </Label>
          <span style={{ fontFamily: MONO, fontSize: 34, color: toneColor(stat.tone), letterSpacing: "-0.02em" }}>{stat.value}</span>
          {stat.sub ? <span style={{ fontFamily: MONO, fontSize: 19, color: stat.subTone ? toneColor(stat.subTone) : C.muted }}>{stat.sub}</span> : null}
        </div>
      ))}
    </div>
  );
}

/* ── cards ──────────────────────────────────────────────────────────────── */

function ReadCard({ card }: { card: OgReadCard }) {
  const headline = fit(card.headline, 120);
  const size = headlineSize(headline, [[48, 70], [80, 62], [100, 56]], 50);
  const lineCount = card.stats && card.stats.length > 0 ? 1 : 2;
  return (
    <Frame eyebrow={card.eyebrow} path={card.path} footnote={card.footnote}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1, gap: 30, paddingBottom: 8 }}>
        <span style={{ fontSize: size, fontWeight: 700, lineHeight: 1.06, letterSpacing: "-0.03em" }}>{headline}</span>
        <Lines lines={card.lines} max={lineCount} size={29} chars={130} />
        {card.stats && card.stats.length > 0 ? <StatRow stats={card.stats} /> : null}
      </div>
    </Frame>
  );
}

function QuotePanel({ quote, width }: { quote: OgQuote; width: number }) {
  const tone: OgTone = quote.dayPct == null ? "flat" : quote.dayPct > 0 ? "up" : quote.dayPct < 0 ? "down" : "flat";
  const sparkTone: OgTone = quote.sparkPct == null ? "flat" : quote.sparkPct >= 0 ? "up" : "down";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width,
        background: C.card,
        border: `1.5px solid ${C.border}`,
        borderRadius: 20,
        padding: "24px 26px 20px",
        gap: 6,
      }}
    >
      {quote.level ? (
        <span style={{ fontFamily: MONO, fontSize: quote.level.length > 9 ? 48 : 58, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{quote.level}</span>
      ) : null}
      {quote.change ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ToneGlyph tone={tone} size={24} />
          <span style={{ fontFamily: MONO, fontSize: 32, color: toneColor(tone) }}>{quote.change}</span>
          {quote.changeLabel ? <span style={{ fontSize: 24, color: C.muted }}>{quote.changeLabel}</span> : null}
        </div>
      ) : null}
      {quote.spark && quote.spark.length > 1 ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 14, gap: 8 }}>
          <Spark values={quote.spark} width={width - 52} height={quote.level ? 128 : 190} tone={sparkTone} />
          {quote.sparkLabel ? (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Label size={16} color={C.muted}>
                {quote.sparkLabel}
              </Label>
              {quote.sparkPct != null ? (
                <span style={{ fontFamily: MONO, fontSize: 18, color: toneColor(sparkTone) }}>{signed(quote.sparkPct)}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function signed(value: number, digits = 1): string {
  const abs = Math.abs(value).toFixed(digits);
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${abs}%`;
}

function QuoteCard({ card }: { card: OgQuoteCard }) {
  const headline = card.headline ? fit(card.headline, 105) : null;
  const size = headline ? headlineSize(headline, [[50, 52], [80, 46]], 42) : 0;
  const hasPanel = Boolean(card.quote.level || (card.quote.spark && card.quote.spark.length > 1));
  return (
    <Frame eyebrow={card.eyebrow} path={card.path} footnote={card.footnote}>
      <div style={{ display: "flex", flexGrow: 1, alignItems: "center", gap: 44, paddingBottom: 6 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {card.showLogo ? <Logo ticker={card.symbol} logo={card.logo} size={80} /> : null}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: card.symbol.length > 6 ? 54 : 66, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>{card.symbol}</span>
              {card.name ? <span style={{ fontSize: 27, color: C.muted, marginTop: 6 }}>{fit(card.name, 34)}</span> : null}
            </div>
          </div>
          {headline ? <span style={{ fontSize: size, fontWeight: 600, lineHeight: 1.12, letterSpacing: "-0.02em" }}>{headline}</span> : null}
          {card.call || card.note ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
              {card.call ? <CallPill call={card.call} size={23} /> : null}
              {card.note ? <span style={{ fontSize: 24, color: C.muted, lineHeight: 1.3 }}>{fit(card.note, 100)}</span> : null}
            </div>
          ) : null}
        </div>
        {hasPanel ? <QuotePanel quote={card.quote} width={400} /> : null}
      </div>
    </Frame>
  );
}

function LandingCard({ card }: { card: OgLandingCard }) {
  const row = card.row;
  const tone: OgTone = row?.dayPct == null ? "flat" : row.dayPct > 0 ? "up" : row.dayPct < 0 ? "down" : "flat";
  return (
    <Frame eyebrow={card.eyebrow} path="/" footnote={card.footnote}>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 30, paddingBottom: 6 }}>
        <span style={{ fontSize: row ? 68 : 80, fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.035em", maxWidth: 1000 }}>{card.headline}</span>
        {row ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 22,
              background: C.card,
              border: `1.5px solid ${C.border}`,
              borderRadius: 20,
              padding: "20px 24px",
            }}
          >
            <Logo ticker={row.ticker} logo={row.logo} size={64} />
            <div style={{ display: "flex", flexDirection: "column", width: 200, flexShrink: 0 }}>
              <span style={{ fontFamily: MONO, fontSize: 34, lineHeight: 1.1 }}>{row.ticker}</span>
              {row.price ? (
                <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontFamily: MONO, fontSize: 22, color: C.muted }}>{row.price}</span>
                  {row.dayPct != null ? <span style={{ fontFamily: MONO, fontSize: 22, color: toneColor(tone) }}>{signed(row.dayPct)}</span> : null}
                </div>
              ) : null}
            </div>
            <span style={{ fontSize: 24, lineHeight: 1.28, color: C.ink, flex: 1 }}>{fit(row.reason, 140)}</span>
            {row.call ? <CallPill call={row.call} size={24} prefix={null} /> : null}
          </div>
        ) : (
          <span style={{ fontSize: 32, color: C.muted, lineHeight: 1.3, maxWidth: 980 }}>{card.sub}</span>
        )}
      </div>
    </Frame>
  );
}

function CompareCard({ card }: { card: OgCompareCard }) {
  const cols = card.columns.slice(0, 4);
  const headline = card.headline ? fit(card.headline, 95) : cols.map((col) => col.ticker).join(" vs ");
  const size = headlineSize(headline, [[30, 60], [60, 48]], 40);
  const narrow = cols.length > 2;
  return (
    <Frame eyebrow={card.eyebrow} path={card.path} footnote={card.footnote}>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 26, paddingBottom: 6 }}>
        <span style={{ fontSize: size, fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.03em" }}>{headline}</span>
        <div style={{ display: "flex", gap: 18 }}>
          {cols.map((col) => {
            const tone: OgTone = col.dayPct == null ? "flat" : col.dayPct > 0 ? "up" : col.dayPct < 0 ? "down" : "flat";
            return (
              <div
                key={col.ticker}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  background: C.card,
                  border: `1.5px solid ${C.border}`,
                  borderRadius: 18,
                  padding: "20px 22px",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <Logo ticker={col.ticker} logo={col.logo} size={narrow ? 48 : 58} />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                    <span style={{ fontFamily: MONO, fontSize: narrow ? 30 : 36, lineHeight: 1.05 }}>{col.ticker}</span>
                    {col.name ? <span style={{ fontSize: 19, color: C.muted }}>{fit(col.name, narrow ? 18 : 28)}</span> : null}
                  </div>
                  {col.call ? <CallPill call={col.call} size={narrow ? 18 : 21} prefix={null} /> : null}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  {col.price ? <span style={{ fontFamily: MONO, fontSize: narrow ? 30 : 36 }}>{col.price}</span> : null}
                  {col.dayPct != null ? <span style={{ fontFamily: MONO, fontSize: narrow ? 20 : 24, color: toneColor(tone) }}>{signed(col.dayPct)}</span> : null}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {col.stats.slice(0, 3).map((stat) => (
                    <div key={stat.label} style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                      <span style={{ fontSize: 19, color: C.muted }}>{stat.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: 20, color: toneColor(stat.tone) }}>{stat.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Frame>
  );
}

function ListCard({ card }: { card: OgListCard }) {
  const headline = fit(card.headline, 100);
  const size = headlineSize(headline, [[45, 60], [75, 52]], 46);
  return (
    <Frame eyebrow={card.eyebrow} path={card.path} footnote={card.footnote}>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 24, paddingBottom: 6 }}>
        <span style={{ fontSize: size, fontWeight: 700, lineHeight: 1.06, letterSpacing: "-0.03em" }}>{headline}</span>
        <div style={{ display: "flex", flexDirection: "column", background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 18, padding: "6px 22px" }}>
          {card.rows.slice(0, 3).map((row, index) => (
            <div
              key={`${row.label}-${index}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                padding: "13px 0",
                borderTop: index === 0 ? "none" : `1px solid ${C.border}`,
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 27, width: 118, flexShrink: 0 }}>{row.label}</span>
              {row.value ? (
                <span style={{ fontFamily: MONO, fontSize: 27, width: 128, flexShrink: 0, color: toneColor(row.tone), textAlign: "right", justifyContent: "flex-end" }}>
                  {row.value}
                </span>
              ) : null}
              <span style={{ fontSize: 24, color: C.ink, flex: 1, lineHeight: 1.25 }}>{fit(row.note, 70)}</span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function RecordCard({ card }: { card: OgRecordCard }) {
  const title = fit(card.title, 60);
  const titleSize = headlineSize(title, [[22, 64], [36, 54]], 46);
  const record = card.record;
  return (
    <Frame eyebrow={card.eyebrow} path={card.path} footnote={card.footnote}>
      <div style={{ display: "flex", flexGrow: 1, alignItems: "center", gap: 40, paddingBottom: 6 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.04, letterSpacing: "-0.03em" }}>{title}</span>
            {card.subtitle ? <span style={{ fontSize: 26, color: C.muted }}>{fit(card.subtitle, 60)}</span> : null}
          </div>
          {card.headline ? <span style={{ fontSize: 30, lineHeight: 1.25, fontWeight: 600 }}>{fit(card.headline, 120)}</span> : null}
          {card.chips.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {card.chipsLabel ? (
                <Label size={17} color={C.muted}>
                  {card.chipsLabel}
                </Label>
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {card.chips.slice(0, 6).map((chip) => (
                  <Chip key={chip} tone={undefined}>
                    {chip}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        {record ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 390,
              background: C.card,
              border: `1.5px solid ${C.border}`,
              borderRadius: 20,
              padding: "22px 24px",
              gap: 14,
            }}
          >
            <Label size={17}>{record.title}</Label>
            {record.rows.map((row) => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 22, color: C.muted }}>{row.label}</span>
                <span style={{ fontFamily: MONO, fontSize: row.big ? 42 : 30, color: toneColor(row.tone), letterSpacing: "-0.02em" }}>{row.value}</span>
              </div>
            ))}
            {record.spark && record.spark.length > 1 ? (
              <Spark values={record.spark} benchmark={record.benchmark} width={342} height={110} tone={record.sparkTone} />
            ) : null}
            {record.period ? <span style={{ fontFamily: MONO, fontSize: 16, color: C.muted, lineHeight: 1.35 }}>{fit(record.period, 80)}</span> : null}
          </div>
        ) : null}
      </div>
    </Frame>
  );
}

function TextCard({ card }: { card: OgTextCard }) {
  const title = fit(card.title, 90);
  const size = headlineSize(title, [[30, 76], [55, 66], [75, 58]], 52);
  return (
    <Frame eyebrow={card.eyebrow} path={card.path} footnote={card.footnote}>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 26, paddingBottom: 6, maxWidth: 1000 }}>
        <span style={{ fontSize: size, fontWeight: 700, lineHeight: 1.04, letterSpacing: "-0.035em" }}>{title}</span>
        {card.sub ? <span style={{ fontSize: 31, color: C.muted, lineHeight: 1.3 }}>{fit(card.sub, 150)}</span> : null}
        {card.chips && card.chips.length > 0 ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {card.chips.slice(0, 5).map((chip) => (
              <Chip key={chip}>{chip}</Chip>
            ))}
          </div>
        ) : null}
        {card.stats && card.stats.length > 0 ? <StatRow stats={card.stats} /> : null}
      </div>
    </Frame>
  );
}

export function OgCardView({ card }: { card: OgCard }) {
  switch (card.kind) {
    case "read":
      return <ReadCard card={card} />;
    case "quote":
      return <QuoteCard card={card} />;
    case "landing":
      return <LandingCard card={card} />;
    case "compare":
      return <CompareCard card={card} />;
    case "list":
      return <ListCard card={card} />;
    case "record":
      return <RecordCard card={card} />;
    case "text":
      return <TextCard card={card} />;
  }
}
