import { ImageResponse } from "next/dist/server/web/spec-extension/image-response";

import { getPremarketOpeningReport, type OpeningReport } from "@/lib/premarket-opening";

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

function concise(value: string, max = 130): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const clipped = clean.slice(0, max + 1).replace(/\s+\S*$/, "").trim();
  return `${clipped}…`;
}

function MoverLine({
  ticker,
  name,
  gap,
  tone,
}: {
  ticker: string;
  name?: string;
  gap: number;
  tone: "up" | "down";
}) {
  const positive = tone === "up";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 0", borderBottom: "1px solid #26322f" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
        <span style={{ color: "#f7faf8", fontSize: 30, fontWeight: 800, letterSpacing: "-0.045em" }}>{ticker}</span>
        <span style={{ color: "#95a49e", fontSize: 16, fontWeight: 600 }}>{concise(name || "US listed equity", 28)}</span>
      </div>
      <span style={{ color: positive ? "#55d6a5" : "#ff8b9b", fontSize: 29, fontWeight: 800, letterSpacing: "-0.05em" }}>
        {signed(gap)}
      </span>
    </div>
  );
}

function renderSocialShareImage(report: OpeningReport | null) {
  const tone = toneFor(report);
  const gainers = report?.premarket.top_gainers.slice(0, 3) ?? [];
  const losers = report?.premarket.top_losers.slice(0, 3) ?? [];
  const futures = [
    { label: "S&P FUT", value: changeFor(report, "ES=F") },
    { label: "NASDAQ", value: changeFor(report, "NQ=F") },
    { label: "VIX", value: changeFor(report, "VIX"), inverse: true },
  ];
  const thesis = concise(
    report?.summary || "The opening tape is warming up. Check futures, breadth, and the largest pre-market gaps before the bell.",
    175,
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "62px 64px 46px",
          background: "#101714",
          color: "#f7faf8",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 14, height: 14, borderRadius: 99, display: "flex", background: "#55d6a5" }} />
            <span style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.055em" }}>stocksbrew</span>
          </div>
          <span style={{ color: "#aab8b2", fontSize: 14, fontWeight: 800, letterSpacing: "0.12em" }}>
            {dateLabel(report?.generated_at)} · {freshLabel(report?.generated_at)}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 72 }}>
          <span style={{ color: "#8ca097", fontSize: 15, fontWeight: 800, letterSpacing: "0.18em" }}>THE OPENING SETUP</span>
          <span style={{ maxWidth: 890, marginTop: 20, fontSize: 58, lineHeight: 1.08, letterSpacing: "-0.065em", fontWeight: 800 }}>
            {thesis}
          </span>
        </div>

        <div style={{ display: "flex", gap: 24, marginTop: 58 }}>
          {futures.map((cue) => {
            const colors = tileColors(cue.value, cue.inverse);
            return (
              <div key={cue.label} style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 21px", borderRadius: 18, background: colors.background }}>
                <span style={{ color: "#64756d", fontSize: 13, fontWeight: 800, letterSpacing: "0.1em" }}>{cue.label}</span>
                <span style={{ marginTop: 12, color: colors.color, fontSize: 31, fontWeight: 800, letterSpacing: "-0.06em" }}>
                  {cue.value === null ? "—" : signed(cue.value)}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 54, marginTop: 58 }}>
          <div style={{ display: "flex", flex: 1, flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 9, height: 9, borderRadius: 99, display: "flex", background: "#55d6a5" }} />
              <span style={{ color: "#aab8b2", fontSize: 14, fontWeight: 800, letterSpacing: "0.14em" }}>GAPPING UP</span>
            </div>
            {gainers.map((mover) => <MoverLine key={mover.ticker} ticker={mover.ticker} name={mover.name} gap={mover.gap_pct} tone="up" />)}
          </div>
          <div style={{ width: 1, display: "flex", background: "#2a3732" }} />
          <div style={{ display: "flex", flex: 1, flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 9, height: 9, borderRadius: 99, display: "flex", background: "#ff8b9b" }} />
              <span style={{ color: "#aab8b2", fontSize: 14, fontWeight: 800, letterSpacing: "0.14em" }}>GAPPING DOWN</span>
            </div>
            {losers.map((mover) => <MoverLine key={mover.ticker} ticker={mover.ticker} name={mover.name} gap={mover.gap_pct} tone="down" />)}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 30, borderTop: "1px solid #2a3732" }}>
          <span style={{ color: tone.accent, fontSize: 17, fontWeight: 800, letterSpacing: "0.02em" }}>{tone.label} before the bell</span>
          <span style={{ color: "#8ca097", fontSize: 13, fontWeight: 800, letterSpacing: "0.08em" }}>stocksbrew.online/premarket</span>
        </div>
      </div>
    ),
    PREMARKET_SOCIAL_SHARE_SIZE,
  );
}

export async function renderPremarketShareImage(format: PremarketShareFormat = "open_graph") {
  const report = await getPremarketOpeningReport().catch(() => null);
  if (format === "social") return renderSocialShareImage(report);
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
