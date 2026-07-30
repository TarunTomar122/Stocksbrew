import { ImageResponse } from "next/dist/server/web/spec-extension/image-response";

import { getPremarketOpeningReport, type OpeningReport } from "@/lib/premarket-opening";
import { getPremarketMovers, type PremarketMovers, type PremarketRow } from "@/lib/premarket";

export const PREMARKET_SHARE_SIZE = { width: 1200, height: 630 } as const;
export const PREMARKET_SOCIAL_SHARE_SIZE = { width: 1080, height: 1350 } as const;

export type PremarketShareFormat = "open_graph" | "social";

type Tile = {
  label: string;
  value: number | null;
  inverse?: boolean;
};

function toneFor(report: OpeningReport | null): { accent: string; label: string } {
  if (!report) return { accent: "#64748b", label: "Warming up" };
  if (report.score >= 56) return { accent: "#059669", label: "Constructive" };
  if (report.score <= 44) return { accent: "#e11d48", label: "Cautious" };
  return { accent: "#d97706", label: "Mixed" };
}

function signed(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function changeFor(report: OpeningReport | null, ticker: string): number | null {
  const value = report?.global_cues.find((cue) => cue.ticker === ticker)?.change_pct;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function tileColors(value: number | null, inverse = false): { background: string; color: string; dot: string } {
  if (value === null) return { background: "#f0f4f2", color: "#91a19a", dot: "#cbd5d1" };
  const isUp = inverse ? value <= 0 : value >= 0;
  if (isUp) return { background: "#d9f7e8", color: "#067647", dot: "#10b981" };
  return { background: "#ffe3e6", color: "#c21e45", dot: "#fb7185" };
}

function freshLabel(value: string | undefined): string {
  if (!value) return "UPDATING";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "UPDATING";
  return date
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
    })
    .toUpperCase() + " ET";
}

function dateLabel(value: string | undefined): string {
  if (!value) return "TODAY";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TODAY";
  return date
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "America/New_York",
    })
    .toUpperCase();
}

function heatTone(change: number): { background: string; foreground: string; border: string } {
  const strength = Math.abs(change);
  if (change >= 0) {
    if (strength >= 6) return { background: "#9ee8d0", foreground: "#006b52", border: "#73dcbf" };
    if (strength >= 3) return { background: "#c4f1df", foreground: "#00795d", border: "#a7e7d0" };
    return { background: "#e8f8f0", foreground: "#08775c", border: "#d7f0e4" };
  }
  if (strength >= 6) return { background: "#ffc6cf", foreground: "#b4233a", border: "#f5aeb9" };
  if (strength >= 3) return { background: "#ffe0e5", foreground: "#c0394d", border: "#f7c9d1" };
  return { background: "#fff0f2", foreground: "#bd4152", border: "#fae0e4" };
}

function HeatCell({ row, prominent = false }: { row: PremarketRow; prominent?: boolean }) {
  const tone = heatTone(row.pre_market_change_pct);
  return (
    <div style={{ display: "flex", minWidth: 0, flex: 1, flexDirection: "column", justifyContent: "space-between", padding: prominent ? "23px 22px" : "14px 14px", border: `1px solid ${tone.border}`, borderRadius: 7, background: tone.background }}>
      <span style={{ color: "#18231f", fontSize: prominent ? 39 : 20, fontWeight: 800, letterSpacing: "-0.06em" }}>{row.ticker}</span>
      <span style={{ color: tone.foreground, fontSize: prominent ? 30 : 20, fontWeight: 800, letterSpacing: "-0.06em" }}>{signed(row.pre_market_change_pct)}</span>
    </div>
  );
}

function renderSocialShareImage(report: OpeningReport | null, movers: PremarketMovers | null) {
  const rows = [
    ...(movers?.gappers_up ?? []),
    ...(movers?.gappers_down ?? []),
  ].sort((a, b) => Math.abs(b.pre_market_change_pct) - Math.abs(a.pre_market_change_pct));
  const fallbackRows: PremarketRow[] = [
    ...(report?.premarket.top_gainers ?? []).map((row) => ({
      instrument_id: row.ticker,
      ticker: row.ticker,
      name: row.name || row.ticker,
      logo_url: null,
      sector: row.sector || null,
      pre_market_price: 0,
      previous_close: 0,
      pre_market_change_pct: row.gap_pct,
    })),
    ...(report?.premarket.top_losers ?? []).map((row) => ({
      instrument_id: row.ticker,
      ticker: row.ticker,
      name: row.name || row.ticker,
      logo_url: null,
      sector: row.sector || null,
      pre_market_price: 0,
      previous_close: 0,
      pre_market_change_pct: row.gap_pct,
    })),
  ];
  const heatmapRows = (rows.length ? rows : fallbackRows).slice(0, 12);
  const heatmapBands = Array.from({ length: Math.ceil(heatmapRows.length / 4) }, (_, index) =>
    heatmapRows.slice(index * 4, index * 4 + 4),
  );
  // A small squareroot curve makes the strongest gaps visibly dominant while
  // keeping the lower part of the map usable. Width within each band remains
  // directly proportional to the absolute percentage move.
  const heightWeights = heatmapBands.map((band) => Math.sqrt(Math.max(...band.map((row) => Math.abs(row.pre_market_change_pct)), 1)));
  const totalHeightWeight = heightWeights.reduce((sum, weight) => sum + weight, 0) || 1;
  const heatmapHeight = 1000;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "46px 52px 36px",
          background: "#f7f9fb",
          color: "#101827",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 12, height: 12, borderRadius: 99, display: "flex", background: "#008a6b" }} />
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.055em" }}>stocksbrew</span>
          </div>
          <span style={{ color: "#6b7280", fontSize: 13, fontWeight: 800, letterSpacing: "0.12em" }}>
            {dateLabel(report?.generated_at)} · {freshLabel(report?.generated_at)}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 38 }}>
          <span style={{ color: "#596760", fontSize: 13, fontWeight: 800, letterSpacing: "0.16em" }}>PRE-MARKET</span>
          <span style={{ color: "#7b8781", fontSize: 13, fontWeight: 800, letterSpacing: "0.1em" }}>TOP {heatmapRows.length} · US MOVERS</span>
        </div>

        <div style={{ display: "flex", height: heatmapHeight, flexDirection: "column", gap: 6, marginTop: 18 }}>
          {heatmapBands.map((band, index) => {
            const rowHeight = Math.floor((heatmapHeight - 6 * Math.max(0, heatmapBands.length - 1)) * (heightWeights[index] / totalHeightWeight));
            return (
              <div key={`band-${index}`} style={{ display: "flex", height: rowHeight, gap: 6 }}>
                {band.map((mover) => (
                  <div key={mover.instrument_id || mover.ticker} style={{ display: "flex", minWidth: 0, flex: Math.max(Math.abs(mover.pre_market_change_pct), 0.75) }}>
                    <HeatCell row={mover} prominent={index === 0} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
          <span style={{ color: "#75817b", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em" }}>SIZE + COLOR = PRE-MARKET CHANGE</span>
          <span style={{ color: "#75817b", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em" }}>stocksbrew.online/premarket</span>
        </div>
      </div>
    ),
    PREMARKET_SOCIAL_SHARE_SIZE,
  );
}

export async function renderPremarketShareImage(format: PremarketShareFormat = "open_graph") {
  const [report, movers] = await Promise.all([
    getPremarketOpeningReport().catch(() => null),
    getPremarketMovers("US").catch(() => null),
  ]);
  if (format === "social") return renderSocialShareImage(report, movers);
  const tone = toneFor(report);
  const score = report?.score ?? 50;
  const tiles: Tile[] = [
    { label: "S&P FUT", value: changeFor(report, "ES=F") },
    { label: "NASDAQ", value: changeFor(report, "NQ=F") },
    { label: "NIKKEI", value: changeFor(report, "NIKKEI") },
    { label: "KOSPI", value: changeFor(report, "KOSPI") },
    { label: "NIFTY", value: changeFor(report, "NIFTY") },
    { label: "EUROPE", value: changeFor(report, "STOXX") },
    { label: "VIX", value: changeFor(report, "VIX"), inverse: true },
    { label: "PRE-MKT", value: report?.premarket.available ? report.premarket.average_gap_pct : null },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "40px 46px 34px",
          background: "#f8fbf9",
          color: "#12241f",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 16, height: 16, borderRadius: 99, display: "flex", background: "#10b981" }} />
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.055em" }}>stocksbrew</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, color: "#60756d", fontSize: 13, fontWeight: 800, letterSpacing: "0.08em" }}>
            <div style={{ width: 8, height: 8, borderRadius: 99, display: "flex", background: tone.accent }} />
            {freshLabel(report?.generated_at)}
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, gap: 42, alignItems: "center" }}>
          <div style={{ width: 364, display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#61776e", fontSize: 14, fontWeight: 800, letterSpacing: "0.13em" }}>US OPENING MOOD</span>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 11, marginTop: 12 }}>
              <span style={{ fontSize: 144, lineHeight: 0.8, letterSpacing: "-0.1em", fontWeight: 800 }}>{score}</span>
              <span style={{ paddingBottom: 12, color: "#72857e", fontSize: 18, fontWeight: 700 }}>/100</span>
            </div>
            <span style={{ marginTop: 24, color: tone.accent, fontSize: 33, fontWeight: 800, letterSpacing: "-0.055em" }}>{tone.label}</span>
            <div style={{ display: "flex", gap: 6, marginTop: 24 }}>
              {Array.from({ length: 10 }, (_, index) => {
                const active = index < Math.ceil(score / 10);
                const segmentColor = index < 4 ? "#fb7185" : index < 6 ? "#fbbf24" : "#34d399";
                return (
                  <div
                    key={index}
                    style={{
                      width: 29,
                      height: 14,
                      borderRadius: 5,
                      display: "flex",
                      background: active ? segmentColor : "#dfe9e4",
                    }}
                  />
                );
              })}
            </div>
            <span style={{ marginTop: 13, color: "#71857d", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em" }}>GLOBAL + FUTURES + BREADTH</span>
          </div>

          <div style={{ display: "flex", flex: 1, flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 15 }}>
              <span style={{ fontSize: 14, color: "#61776e", fontWeight: 800, letterSpacing: "0.13em" }}>MARKET HEATMAP</span>
              <span style={{ fontSize: 12, color: "#91a19a", fontWeight: 700 }}>TODAY&apos;S CHANGE</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {tiles.map((tile) => {
                const colors = tileColors(tile.value, tile.inverse);
                return (
                  <div
                    key={tile.label}
                    style={{
                      width: 160,
                      height: 125,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      padding: "17px 18px",
                      borderRadius: 19,
                      background: colors.background,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ color: "#556b63", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em" }}>{tile.label}</span>
                      <div style={{ width: 8, height: 8, borderRadius: 99, display: "flex", background: colors.dot }} />
                    </div>
                    <span style={{ color: colors.color, fontSize: tile.value === null ? 26 : 30, fontWeight: 800, letterSpacing: "-0.06em" }}>
                      {tile.value === null ? "—" : signed(tile.value)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#81938c", fontSize: 13, fontWeight: 700, letterSpacing: "0.055em" }}>
          <span>stocksbrew.online/premarket</span>
          <span>NOT INVESTMENT ADVICE</span>
        </div>
      </div>
    ),
    PREMARKET_SHARE_SIZE,
  );
}
