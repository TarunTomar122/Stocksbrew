import { ImageResponse } from "next/server";

import { C, Mark, fit, headlineSize } from "@/lib/og/cards";
import { loadOgFonts } from "@/lib/og/fonts";
import { OG_HEIGHT, OG_WIDTH } from "@/lib/og/url";

import type { ShareBars, ShareCard, ShareTone } from "./types";

/**
 * The share card as an image, drawn with the OG system's pieces (colours,
 * mark, fonts, `fit`) at 1200x630, so a posted link unfurls as the card.
 * Same parts as the page's card (components/share/share-card.tsx): topic,
 * headline, up to two lines, the bars, and the footnote.
 */

const SANS = "Instrument Sans";
const MONO = "Geist Mono";
const PAD = 60;

function toneColor(tone: ShareTone): string {
  return tone === "up" ? C.up : tone === "down" ? C.down : C.ink;
}

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

function ShareBarsPanel({ bars, width }: { bars: ShareBars; width: number }) {
  const inner = width - 52;
  const box = {
    display: "flex",
    flexDirection: "column" as const,
    width,
    background: C.card,
    border: `1.5px solid ${C.border}`,
    borderRadius: 20,
    padding: "22px 26px",
    gap: 14,
  };
  const title = (
    <span style={{ fontFamily: MONO, fontSize: 17, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted }}>{fit(bars.title, 40)}</span>
  );
  if (bars.style === "months") {
    const max = Math.max(...bars.rows.map((row) => row.value), 0) || 1;
    const colW = Math.floor((inner - 11 * 6) / 12);
    return (
      <div style={box}>
        {title}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 200 }}>
          {bars.rows.map((row, index) => (
            <div key={index} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", width: colW, height: 200 }}>
              <div style={{ display: "flex", width: colW, height: Math.max(row.value > 0 ? 6 : 2, Math.round((row.value / max) * 168)), background: row.value > 0 ? C.copper : C.border, borderRadius: 4 }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {bars.rows.map((row, index) => (
            <span key={index} style={{ display: "flex", justifyContent: "center", width: colW, fontFamily: MONO, fontSize: 17, color: C.muted }}>
              {row.label}
            </span>
          ))}
        </div>
      </div>
    );
  }
  const max = Math.max(...bars.rows.map((row) => Math.abs(row.value)), 0) || 1;
  const rows = bars.rows.slice(0, bars.style === "versus" ? 2 : 5);
  const big = bars.style === "versus";
  return (
    <div style={box}>
      {title}
      <div style={{ display: "flex", flexDirection: "column", gap: big ? 22 : 13 }}>
        {rows.map((row, index) => {
          const color = bars.style === "versus" ? toneColor(row.tone) : row.highlight ? C.copper : C.faint;
          return (
            <div key={index} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: big ? 24 : 21, fontWeight: row.highlight ? 600 : 400, color: C.ink }}>{fit(row.label, 26)}</span>
                {row.display ? <span style={{ fontFamily: MONO, fontSize: big ? 26 : 20, color: bars.style === "versus" ? color : C.ink }}>{row.display}</span> : null}
              </div>
              <div style={{ display: "flex", width: inner, height: big ? 18 : 10, background: C.well, borderRadius: 999 }}>
                <div style={{ display: "flex", width: Math.max(6, Math.round((Math.abs(row.value) / max) * inner)), height: big ? 18 : 10, background: color, borderRadius: 999 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ShareCardImage({ card, path }: { card: ShareCard; path: string }) {
  const withBars = Boolean(card.bars);
  const textWidth = withBars ? 600 : OG_WIDTH - PAD * 2;
  const headline = fit(card.headline, withBars ? 150 : 170);
  const size = withBars ? headlineSize(headline, [[60, 50], [90, 44], [120, 39]], 35) : headlineSize(headline, [[70, 62], [110, 54], [150, 48]], 44);
  return (
    <div style={{ width: OG_WIDTH, height: OG_HEIGHT, display: "flex", flexDirection: "column", background: C.page, color: C.ink, fontFamily: SANS, position: "relative" }}>
      <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: OG_WIDTH, height: 10, background: C.copper }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `38px ${PAD}px 0` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Mark size={36} />
          <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>stocksbrew</span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase", color: C.copper }}>{fit(card.topic, 30)}</span>
      </div>
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
        {card.bars ? <ShareBarsPanel bars={card.bars} width={OG_WIDTH - PAD * 2 - textWidth - 40} /> : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: `0 ${PAD}px`, padding: "16px 0 30px", borderTop: `1.5px solid ${C.border}`, gap: 24 }}>
        <span style={{ fontFamily: MONO, fontSize: 19, color: C.ink, flexShrink: 0 }}>{`stocksbrew.online${path}`}</span>
        <span style={{ fontFamily: MONO, fontSize: 17, color: C.muted, textAlign: "right" }}>{fit(card.footnote, 62)}</span>
      </div>
    </div>
  );
}

/**
 * A snapshot never changes, but its owner can delete it, so the CDN keeps the
 * image only ten minutes: a deleted share stops showing soon after (sites that
 * already unfurled the link keep their own copy).
 */
export async function renderShareImage(card: ShareCard, path: string): Promise<Response> {
  const fonts = await loadOgFonts();
  return new ImageResponse(<ShareCardImage card={card} path={path} />, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts,
    headers: {
      "cache-control": "public, max-age=300, s-maxage=600",
      "x-robots-tag": "noindex",
    },
  });
}
