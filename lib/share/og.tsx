import { ImageResponse } from "next/server";

import { fit, headlineSize } from "@/lib/og/cards";
import { loadOgFonts } from "@/lib/og/fonts";
import { loadLogos } from "@/lib/og/logos";
import { C, LineChart, LogoTile, MONO, Mark, MoverChip, SANS, toneColor, weekdayOf } from "@/lib/og/pieces";
import { OG_HEIGHT, OG_WIDTH } from "@/lib/og/url";

import { cardLogos } from "./cards";
import type { ShareBars, ShareCard, ShareTone } from "./types";

/**
 * The share card as an image, 1200x630, so a posted link unfurls as a little
 * poster: the big number, the short headline, the picture (the week's line
 * against the S&P 500, bars with logos, the year's dividend months) and the
 * stocks as logo chips. Same parts and order as the page's card
 * (components/share/share-card.tsx). A card saved before cards had a big
 * number draws the words-only layout. No coloured edges anywhere.
 */

const PAD = 56;

/** "S&P 500" never breaks across lines. */
function keep(text: string): string {
  return text.replace(/S&P 500/g, "S&P\u00a0500");
}
type Logos = Record<string, string | null>;

function Glyph({ tone, size }: { tone: ShareTone; size: number }) {
  if (tone === "flat") {
    return (
      <div style={{ display: "flex", width: size, height: size, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", width: size * 0.45, height: size * 0.45, borderRadius: 999, background: C.copper }} />
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

function PanelTitle({ children }: { children: string }) {
  return <span style={{ fontSize: 21, color: C.muted, lineHeight: 1.2 }}>{fit(children, 48)}</span>;
}

function RowLabel({ label, ticker, logos, size, bold }: { label: string; ticker: string | null | undefined; logos: Logos; size: number; bold: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexShrink: 1 }}>
      {ticker ? <LogoTile ticker={ticker} src={logos[ticker]} size={Math.round(size * 1.45)} /> : null}
      <span style={{ fontSize: size, fontWeight: bold ? 600 : 400, color: C.ink }}>{fit(label, ticker ? 24 : 30)}</span>
    </div>
  );
}

function BarsPanel({ bars, width, height, logos }: { bars: ShareBars; width: number; height: number; logos: Logos }) {
  const inner = width - 52;
  const box = {
    display: "flex",
    flexDirection: "column" as const,
    width,
    height,
    background: C.card,
    border: `1.5px solid ${C.border}`,
    borderRadius: 24,
    padding: "22px 26px",
    gap: 16,
  };

  if (bars.style === "months") {
    const max = Math.max(...bars.rows.map((row) => row.value), 0) || 1;
    const colW = Math.floor((inner - 11 * 7) / 12);
    const colH = height - 44 - 21 - 16 - 16 - 30;
    return (
      <div style={box}>
        <PanelTitle>{bars.title}</PanelTitle>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 7, height: colH }}>
          {bars.rows.map((row, index) => (
            <div key={index} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", width: colW, height: colH, gap: 6 }}>
              {row.highlight && row.display ? <span style={{ fontFamily: MONO, fontSize: 17, color: C.copper }}>{row.display}</span> : null}
              <div
                style={{
                  display: "flex",
                  width: colW,
                  height: Math.max(row.value > 0 ? 8 : 3, Math.round((row.value / max) * (colH - 30))),
                  background: row.value <= 0 ? C.border : row.highlight || !bars.rows.some((item) => item.highlight) ? C.copper : C.copperSoft,
                  borderRadius: 6,
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          {bars.rows.map((row, index) => (
            <span key={index} style={{ display: "flex", justifyContent: "center", width: colW, fontFamily: MONO, fontSize: 17, color: row.highlight ? C.ink : C.faint }}>
              {row.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (bars.style === "signed") {
    const rows = bars.rows.slice(0, 6);
    const max = Math.max(...rows.map((row) => Math.abs(row.value)), 0) || 1;
    const half = Math.floor((inner - 230 - 70) / 2);
    const rowH = Math.min(52, Math.floor((height - 44 - 21 - 16) / rows.length) - 6);
    return (
      <div style={box}>
        <PanelTitle>{bars.title}</PanelTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((row, index) => {
            const len = Math.max(4, Math.round((Math.abs(row.value) / max) * half));
            const color = toneColor(row.tone) === C.ink ? C.faint : toneColor(row.tone);
            return (
              <div key={index} style={{ display: "flex", alignItems: "center", height: rowH }}>
                <div style={{ display: "flex", width: 230, flexShrink: 0 }}>
                  <RowLabel label={row.label} ticker={row.ticker} logos={logos} size={20} bold={Boolean(row.highlight)} />
                </div>
                <div style={{ display: "flex", width: half, justifyContent: "flex-end" }}>
                  {row.value < 0 ? <div style={{ display: "flex", width: len, height: 18, background: color, borderRadius: "6px 0 0 6px" }} /> : null}
                </div>
                <div style={{ display: "flex", width: 2, height: rowH, background: C.border }} />
                <div style={{ display: "flex", width: half }}>
                  {row.value > 0 ? <div style={{ display: "flex", width: len, height: 18, background: color, borderRadius: "0 6px 6px 0" }} /> : null}
                </div>
                <span style={{ display: "flex", width: 70, justifyContent: "flex-end", fontFamily: MONO, fontSize: 20, color: toneColor(row.tone) }}>{row.display ?? ""}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const versus = bars.style === "versus";
  const rows = bars.rows.slice(0, versus ? 2 : 5);
  const max = Math.max(...rows.map((row) => Math.max(Math.abs(row.value), row.benchmark ?? 0)), 0) || 1;
  const thick = versus ? 22 : 12;
  return (
    <div style={box}>
      <PanelTitle>{bars.title}</PanelTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: versus ? 26 : rows.length > 4 ? 11 : 16 }}>
        {rows.map((row, index) => {
          const color = versus ? (row.tone === "flat" ? (row.highlight ? C.copper : C.faint) : toneColor(row.tone)) : row.highlight ? C.copper : C.copperSoft;
          return (
            <div key={index} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <RowLabel label={row.label} ticker={row.ticker} logos={logos} size={versus ? 24 : 20} bold={Boolean(row.highlight)} />
                {row.display ? (
                  <span style={{ fontFamily: MONO, fontSize: versus ? 28 : 19, color: versus && row.tone !== "flat" ? color : C.ink, flexShrink: 0 }}>{row.display}</span>
                ) : null}
              </div>
              <div style={{ display: "flex", position: "relative", width: inner, height: thick, background: C.well, borderRadius: 999 }}>
                <div style={{ display: "flex", width: Math.max(8, Math.round((Math.abs(row.value) / max) * inner)), height: thick, background: color, borderRadius: 999 }} />
                {row.benchmark != null ? (
                  <div style={{ display: "flex", position: "absolute", left: Math.round((row.benchmark / max) * inner) - 2, top: -5, width: 4, height: thick + 10, background: C.ink, borderRadius: 2 }} />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {rows.some((row) => row.benchmark != null) ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", width: 4, height: 18, background: C.ink, borderRadius: 2 }} />
          <span style={{ fontSize: 17, color: C.muted }}>{"S&P 500 share"}</span>
        </div>
      ) : null}
    </div>
  );
}

function CurvePanel({ card, width, height }: { card: ShareCard; width: number; height: number }) {
  const curve = card.curve!;
  return (
    <div
      style={{ display: "flex", flexDirection: "column", width, height, background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 24, padding: "22px 26px 14px", gap: 12 }}
    >
      <PanelTitle>{curve.title}</PanelTitle>
      <LineChart mine={curve.mine} market={curve.market} labels={curve.days.map(weekdayOf)} width={width - 52} height={height - 22 - 14 - 21 - 12 - 4} mineLabel="My holdings" />
    </div>
  );
}

function Header({ topic }: { topic: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `34px ${PAD}px 0` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Mark size={34} />
        <span style={{ fontSize: 29, fontWeight: 600, letterSpacing: "-0.02em" }}>stocksbrew</span>
      </div>
      <span style={{ fontSize: 22, color: C.muted }}>{fit(topic, 34)}</span>
    </div>
  );
}

function Footer({ path, footnote }: { path: string; footnote: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: `0 ${PAD}px`, padding: "14px 0 26px", borderTop: `1.5px solid ${C.border}`, gap: 24 }}>
      <span style={{ fontFamily: MONO, fontSize: 19, color: C.ink, flexShrink: 0 }}>{`stocksbrew.online${path}`}</span>
      <span style={{ fontFamily: MONO, fontSize: 16, color: C.muted, textAlign: "right" }}>{fit(footnote, 62)}</span>
    </div>
  );
}

/** A card with a big number: the number and headline on the left, the picture on the right, the chips under both. */
function PosterCard({ card, path, logos }: { card: ShareCard; path: string; logos: Logos }) {
  const figure = card.figure!;
  const chips = (card.chips ?? []).slice(0, 6);
  const hasPanel = Boolean(card.curve || card.bars);
  const leftW = hasPanel ? 440 : OG_WIDTH - PAD * 2;
  const panelW = OG_WIDTH - PAD * 2 - leftW - 40;
  const bodyH = chips.length > 0 ? 330 : 412;
  const valueSize = figure.value.length > 7 ? 92 : figure.value.length > 5 ? 108 : 124;
  const headline = keep(fit(card.headline, hasPanel ? 140 : 150));
  const size = hasPanel ? headlineSize(headline, [[44, 38], [64, 33], [90, 29], [110, 26]], 23) : headlineSize(headline, [[60, 44], [100, 38]], 34);
  return (
    <div style={{ width: OG_WIDTH, height: OG_HEIGHT, display: "flex", flexDirection: "column", background: C.page, color: C.ink, fontFamily: SANS }}>
      <Header topic={card.topic} />
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 22, padding: `0 ${PAD}px` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 40, height: bodyH }}>
          <div style={{ display: "flex", flexDirection: "column", width: leftW, gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: valueSize, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.045em", color: figure.tone === "flat" ? C.ink : toneColor(figure.tone) }}>{figure.value}</span>
              <span style={{ fontSize: 24, color: C.muted, lineHeight: 1.25, marginTop: 10 }}>{keep(fit(figure.label, 110))}</span>
            </div>
            <span style={{ fontSize: size, fontWeight: 600, lineHeight: 1.18, letterSpacing: "-0.015em" }}>{headline}</span>
            {card.lines[0] && !chips.length && headline.length <= 95 ? (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ display: "flex", marginTop: 4 }}>
                  <Glyph tone={card.lines[0].tone} size={18} />
                </div>
                <span style={{ fontSize: 20, lineHeight: 1.3, color: C.muted }}>{fit(card.lines[0].text, 90)}</span>
              </div>
            ) : null}
          </div>
          {card.curve ? <CurvePanel card={card} width={panelW} height={bodyH} /> : card.bars ? <BarsPanel bars={card.bars} width={panelW} height={bodyH} logos={logos} /> : null}
        </div>
        {chips.length > 0 ? (
          <div style={{ display: "flex", gap: 12 }}>
            {chips.map((chip, index) => (
              <MoverChip key={index} ticker={chip.ticker} label={chip.label} display={chip.display} tone={chip.tone} logo={chip.ticker ? logos[chip.ticker] : null} size={chips.length > 5 ? 19 : 21} />
            ))}
          </div>
        ) : null}
      </div>
      <Footer path={path} footnote={card.footnote} />
    </div>
  );
}

/** The words-only layout, for cards saved before cards had a big number. */
function WordsCard({ card, path, logos }: { card: ShareCard; path: string; logos: Logos }) {
  const withBars = Boolean(card.bars);
  const textWidth = withBars ? 600 : OG_WIDTH - PAD * 2;
  const headline = keep(fit(card.headline, withBars ? 150 : 170));
  const size = withBars ? headlineSize(headline, [[60, 50], [90, 44], [120, 39]], 35) : headlineSize(headline, [[70, 62], [110, 54], [150, 48]], 44);
  return (
    <div style={{ width: OG_WIDTH, height: OG_HEIGHT, display: "flex", flexDirection: "column", background: C.page, color: C.ink, fontFamily: SANS }}>
      <Header topic={card.topic} />
      <div style={{ display: "flex", flexGrow: 1, alignItems: "center", gap: 40, padding: `0 ${PAD}px` }}>
        <div style={{ display: "flex", flexDirection: "column", width: textWidth, gap: 24 }}>
          <span style={{ fontSize: size, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.025em" }}>{headline}</span>
          {card.lines.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {card.lines.slice(0, withBars ? 1 : 2).map((line, index) => (
                <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ display: "flex", marginTop: 5 }}>
                    <Glyph tone={line.tone} size={22} />
                  </div>
                  <span style={{ fontSize: 25, lineHeight: 1.3, color: C.muted }}>{fit(line.text, withBars ? 90 : 120)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {card.bars ? <BarsPanel bars={card.bars} width={OG_WIDTH - PAD * 2 - textWidth - 40} height={360} logos={logos} /> : null}
      </div>
      <Footer path={path} footnote={card.footnote} />
    </div>
  );
}

export function ShareCardImage({ card, path, logos = {} }: { card: ShareCard; path: string; logos?: Logos }) {
  return card.figure ? <PosterCard card={card} path={path} logos={logos} /> : <WordsCard card={card} path={path} logos={logos} />;
}

/**
 * A snapshot never changes, but its owner can delete it, so the CDN keeps the
 * image only ten minutes: a deleted share stops showing soon after (sites that
 * already unfurled the link keep their own copy).
 */
export async function renderShareImage(card: ShareCard, path: string): Promise<Response> {
  const [fonts, logos] = await Promise.all([loadOgFonts(), loadLogos(cardLogos(card))]);
  return new ImageResponse(<ShareCardImage card={card} path={path} logos={logos} />, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts,
    headers: {
      "cache-control": "public, max-age=300, s-maxage=600",
      "x-robots-tag": "noindex",
    },
  });
}
