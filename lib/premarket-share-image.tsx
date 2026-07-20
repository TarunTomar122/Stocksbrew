import { ImageResponse } from "next/dist/server/web/spec-extension/image-response";

import { getPremarketOpeningReport, type OpeningReport } from "@/lib/premarket-opening";

export const PREMARKET_SHARE_SIZE = { width: 1200, height: 630 } as const;

function toneFor(report: OpeningReport | null): { accent: string; soft: string; label: string } {
  if (!report) return { accent: "#64748b", soft: "#e2e8f0", label: "Building" };
  if (report.score >= 56) return { accent: "#10b981", soft: "#d1fae5", label: "Constructive" };
  if (report.score <= 44) return { accent: "#f43f5e", soft: "#ffe4e6", label: "Cautious" };
  return { accent: "#f59e0b", soft: "#fef3c7", label: "Mixed" };
}

function signed(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function cue(report: OpeningReport, group: string): number | null {
  const rows = report.global_cues.filter((item) => item.group === group);
  if (!rows.length) return null;
  return rows.reduce((total, item) => total + item.change_pct, 0) / rows.length;
}

function freshLabel(value: string | undefined): string {
  if (!value) return "Fresh this morning";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fresh this morning";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  }) + " ET";
}

export async function renderPremarketShareImage() {
  const report = await getPremarketOpeningReport().catch(() => null);
  const tone = toneFor(report);
  const futures = report ? cue(report, "futures") : null;
  const asia = report ? cue(report, "asia") : null;
  const topDrivers = report?.drivers.slice(0, 3) ?? [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "42px 46px",
          background: "linear-gradient(135deg, #071a17 0%, #0c2d27 54%, #0c201d 100%)",
          color: "#f8fafc",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 15, height: 15, borderRadius: 999, display: "flex", background: "#10b981" }} />
            <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: "-0.04em" }}>stocksbrew</span>
          </div>
          <span
            style={{
              display: "flex",
              borderRadius: 999,
              padding: "9px 14px",
              color: tone.accent,
              background: tone.soft,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            US opening report
          </span>
        </div>

        <div style={{ display: "flex", flex: 1, gap: 40, alignItems: "center" }}>
          <div style={{ width: 448, display: "flex", flexDirection: "column", gap: 18 }}>
            <span style={{ color: "#9eb8b2", fontSize: 15, letterSpacing: "0.1em", fontWeight: 700, textTransform: "uppercase" }}>
              Expected opening setup
            </span>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
              <span style={{ fontSize: 72, lineHeight: 0.9, fontWeight: 800, letterSpacing: "-0.07em" }}>
                {report?.score ?? "—"}
              </span>
              <span style={{ paddingBottom: 8, color: "#9eb8b2", fontSize: 17, fontWeight: 600 }}> / 100</span>
            </div>
            <span style={{ color: tone.accent, fontSize: 32, fontWeight: 800, letterSpacing: "-0.04em" }}>
              {report?.label ?? "Opening read warming up"}
            </span>
            <span style={{ maxWidth: 425, color: "#c3d5d0", fontSize: 17, lineHeight: 1.4 }}>
              {report?.summary ?? "Global markets, social signals and live pre-market pricing will populate before the bell."}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flex: 1,
              minHeight: 394,
              flexDirection: "column",
              gap: 16,
              padding: "24px",
              borderRadius: 24,
              background: "#f8faf9",
              color: "#10231f",
            }}
          >
            <div style={{ display: "flex", gap: 12 }}>
              {[
                { label: "US futures", value: futures },
                { label: "Asia", value: asia },
                {
                  label: "Pre-market",
                  value: report?.premarket.available ? report.premarket.average_gap_pct : null,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{ display: "flex", flex: 1, flexDirection: "column", gap: 6, padding: "13px 14px", borderRadius: 14, background: "#edf4f1" }}
                >
                  <span style={{ fontSize: 12, color: "#637a73", fontWeight: 700 }}>{item.label}</span>
                  <span style={{ color: item.value === null ? "#64748b" : item.value >= 0 ? "#047857" : "#e11d48", fontSize: 20, fontWeight: 800 }}>
                    {item.value === null ? "Waiting" : signed(item.value)}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 2 }}>
              {(topDrivers.length ? topDrivers : [{ title: "Live inputs", detail: "The next scheduled opening read is collecting market inputs.", tone: "neutral" as const }]).map((driver, index) => (
                <div key={`${driver.title}-${index}`} style={{ display: "flex", gap: 12, alignItems: "center", padding: "11px 0", borderTop: index ? "1px solid #dce8e3" : "0" }}>
                  <div style={{ width: 8, height: 8, borderRadius: 999, display: "flex", background: driver.tone === "negative" ? "#f43f5e" : driver.tone === "positive" ? "#10b981" : "#f59e0b" }} />
                  <span style={{ width: 132, fontSize: 14, fontWeight: 800 }}>{driver.title}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "#536761" }}>{driver.detail}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", color: "#71867f", fontSize: 12 }}>
              <span>{freshLabel(report?.generated_at)}</span>
              <span>stocksbrew.online/premarket</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#9eb8b2", fontSize: 13 }}>
          <span>Global markets · news · monitored social conversation · pre-market movers</span>
          <span>Not investment advice</span>
        </div>
      </div>
    ),
    PREMARKET_SHARE_SIZE,
  );
}
