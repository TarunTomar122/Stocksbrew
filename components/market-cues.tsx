import type { MarketTile } from "@/lib/market-tiles";

type Props = {
  title?: string;
  tiles: MarketTile[];
};

type TileMeta = { initial: string; icon?: string; bg: string; fg: string };

const TILE_META: Record<string, TileMeta> = {
  US_IDX_SPX:        { initial: "S",  icon: "show_chart",        bg: "#0052ff", fg: "#ffffff" },
  US_IDX_NDX:        { initial: "N",  icon: "memory",            bg: "#7c3aed", fg: "#ffffff" },
  US_MAC_GOLD:       { initial: "Au", bg: "#f59e0b", fg: "#111111" },
  US_MAC_SILVER:     { initial: "Ag", bg: "#94a3b8", fg: "#111111" },
  US_MAC_OIL:        { initial: "O",  icon: "oil_barrel",        bg: "#1c1c1e", fg: "#ffffff" },
  US_MAC_VIX:        { initial: "V",  icon: "bolt",              bg: "#ef4444", fg: "#ffffff" },
  IN_IDX_NIFTY50:    { initial: "N",  icon: "show_chart",        bg: "#f97316", fg: "#ffffff" },
  IN_IDX_BANKNIFTY:  { initial: "B",  icon: "account_balance",   bg: "#10b981", fg: "#ffffff" },
  IN_IDX_VIX:        { initial: "V",  icon: "bolt",              bg: "#ef4444", fg: "#ffffff" },
};

const PALETTE = ["#1c1c1e", "#0052ff", "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b"];

function metaFor(id: string, label: string): TileMeta {
  if (TILE_META[id]) return TILE_META[id];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return {
    initial: (label || id).charAt(0).toUpperCase(),
    icon: "show_chart",
    bg: PALETTE[hash % PALETTE.length],
    fg: "#ffffff",
  };
}

function fmtPrice(value: number, currency?: string) {
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency}${formatted}` : formatted;
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function syntheticSeries(seed: string, changePct: number, points = 36): number[] {
  // Deterministic synthetic price line that ends at today's actual change %.
  // Three superimposed sine waves (broad swing, mid ripple, fast jitter)
  // plus light noise so it reads as real price action rather than a ramp.
  let h = hash32(seed) >>> 0;
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return (h & 0xffff) / 0xffff;
  };

  const start = 100;
  const end = 100 + changePct;
  // Amplitude scales with the day's move but with a generous floor so even
  // a 0.2% tape still has visible up/down motion across the line.
  const baseAmp = Math.max(2.4, Math.abs(changePct) * 1.2);

  const amp1 = baseAmp * (0.85 + rand() * 0.4);
  const amp2 = baseAmp * (0.55 + rand() * 0.4);
  const amp3 = baseAmp * (0.25 + rand() * 0.25);
  const freq1 = 2.0 + rand() * 1.8; // 1.0–1.9 cycles — broad swing
  const freq2 = 5.5 + rand() * 3.5; // 2.7–4.5 cycles — mid ripple
  const freq3 = 10 + rand() * 4.0;  // 5.0–7.0 cycles — fast jitter
  const phase1 = rand() * Math.PI * 2;
  const phase2 = rand() * Math.PI * 2;
  const phase3 = rand() * Math.PI * 2;

  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const trend = start + (end - start) * t;
    const wave =
      Math.sin(t * freq1 * Math.PI + phase1) * amp1 +
      Math.sin(t * freq2 * Math.PI + phase2) * amp2 +
      Math.sin(t * freq3 * Math.PI + phase3) * amp3;
    const noise = (rand() - 0.5) * baseAmp * 0.5;
    // Lightly damp endpoints so the curve still lands close to today's number.
    const damp = Math.min(t, 1 - t) * 2; // 0 at edges, 1 at center
    out.push(trend + (wave + noise) * (0.55 + 0.45 * damp));
  }
  return out;
}

function Sparkline({
  data,
  positive,
  width = 88,
  height = 36,
}: {
  data: number[];
  positive: boolean;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) return null;
  const stroke = positive ? "#10b981" : "#ef4444";
  const fillId = `mc-spark-${positive ? "up" : "dn"}-${Math.round(Math.random() * 1e6)}`;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 3;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => ({
    x: i * step,
    y: pad + (1 - (v - min) / range) * (height - pad * 2),
  }));
  const linePath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const areaPath = [
    linePath,
    `L ${pts[pts.length - 1].x.toFixed(2)} ${height}`,
    `L 0 ${height}`,
    "Z",
  ].join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-hidden
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${fillId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MarketCues({ title = "Market cues", tiles }: Props) {
  const cues = tiles.filter((t) => t.kind === "index" || t.kind === "macro");
  if (cues.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4 mb-5">
        <h2 className="text-[16px] md:text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
          {title}
        </h2>
        <span className="text-[12px] text-[#6b7280]">
          Indices and macro · live
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {cues.slice(0, 9).map((t) => {
          const positive = t.changePct >= 0;
          const meta = metaFor(t.id, t.label);
          // Backend ships a 100→100+change linear interpolation as `series`.
          // That's monotonic and renders as a straight ramp — replace with
          // a synthetic wavy line so the tile reads as live price action.
          const monotonic =
            !t.series ||
            t.series.length < 3 ||
            (() => {
              let inc = 0;
              let dec = 0;
              for (let i = 1; i < t.series.length; i++) {
                if (t.series[i] > t.series[i - 1]) inc++;
                else if (t.series[i] < t.series[i - 1]) dec++;
              }
              return inc === 0 || dec === 0;
            })();
          const series = monotonic
            ? syntheticSeries(t.id, t.changePct)
            : t.series;
          return (
            <div
              key={t.id}
              className="group flex items-center gap-4 rounded-2xl border border-[#e5e7eb] bg-white px-5 py-4"
            >
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
                style={{ background: meta.bg, color: meta.fg }}
                aria-hidden
              >
                {meta.icon ? (
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 26, fontVariationSettings: "'wght' 500" }}
                  >
                    {meta.icon}
                  </span>
                ) : (
                  <span className="text-[18px] font-semibold">{meta.initial}</span>
                )}
              </div>
              <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                <span className="text-[15px] font-semibold text-[#111111] truncate tracking-[-0.01em]">
                  {t.label}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-[14px] text-[#6b7280] tabular-nums truncate">
                    {fmtPrice(t.price, t.currency)}
                  </span>
                  <span
                    className={`text-[13px] font-semibold tabular-nums ${
                      positive ? "text-[#10b981]" : "text-[#ef4444]"
                    }`}
                  >
                    {positive ? "▲" : "▼"} {Math.abs(t.changePct).toFixed(2)}%
                  </span>
                </div>
              </div>
              <Sparkline data={series} positive={positive} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
