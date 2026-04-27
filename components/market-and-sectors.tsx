import { MarketSectorTreemap } from "@/components/market-sector-treemap";
import type { MarketTile } from "@/lib/market-tiles";
import type { SectorSlugMap } from "@/lib/sector";

const CUE_TOOLTIPS: Record<string, { up: string; down: string; what: string }> = {
  US_IDX_SPX: {
    what: "S&P 500 — broad US large-cap barometer.",
    up: "Up = risk-on across the market; growth + cyclicals typically firm.",
    down: "Down = broad risk-off; defensives usually outperform.",
  },
  US_IDX_NDX: {
    what: "Nasdaq Composite — tech & growth tilt.",
    up: "Up = appetite for duration and growth leadership (semis, megacap tech).",
    down: "Down = growth derating; often on rising yields or AI/chip stress.",
  },
  US_MAC_GOLD: {
    what: "Gold — safe-haven + inflation hedge.",
    up: "Up = flight to safety, weaker dollar, or rising inflation fears.",
    down: "Down = risk-on, stronger dollar, or fading inflation worry.",
  },
  US_MAC_SILVER: {
    what: "Silver — hybrid monetary + industrial metal.",
    up: "Up = reflation + growth optimism (solar, EV, electronics demand).",
    down: "Down = industrial demand softness or dollar strength.",
  },
  US_MAC_OIL: {
    what: "WTI Crude Oil — global demand + supply gauge.",
    up: "Up = demand strength or supply shock (OPEC cuts, geopolitics).",
    down: "Down = demand weakness, inventory build, or supply glut.",
  },
  US_MAC_VIX: {
    what: "VIX — implied 30-day S&P 500 volatility (fear gauge).",
    up: "Up = fear rising, hedging demand, market expecting bigger swings.",
    down: "Down = calm, complacency, lower hedging cost.",
  },
};

function InfoTooltip({ tile }: { tile: MarketTile }) {
  const info = CUE_TOOLTIPS[tile.id];
  if (!info) return null;
  const positive = tile.changePct >= 0;
  const directionText = positive ? info.up : info.down;
  return (
    <span className="relative inline-flex ml-1.5 group/tip align-middle">
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center w-[13px] h-[13px] text-[9px] font-bold text-on-surface-variant border border-outline-variant/50 rounded-full cursor-help hover:text-primary hover:border-primary/40 transition-colors"
      >
        i
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full mt-2 w-64 p-3 bg-surface-container-highest border border-outline-variant/60 text-[11px] leading-relaxed text-on-surface opacity-0 group-hover/tip:opacity-100 transition-opacity z-20 shadow-lg"
      >
        <span className="block font-semibold mb-1 text-on-surface">{info.what}</span>
        <span className="block text-on-surface-variant">{directionText}</span>
      </span>
    </span>
  );
}

function formatPrice(value: number, currency?: string) {
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency}${formatted}` : formatted;
}

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const width = 120;
  const height = 40;
  const strokeColor = positive ? "var(--signal-bullish)" : "var(--signal-bearish)";
  const fillId = `grad-${positive ? "bull" : "bear"}-${Math.random().toString(36).slice(2, 6)}`;

  if (data.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden="true">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--outline-variant)" strokeWidth="1" strokeDasharray="3 4" />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 3;
  const step = width / (data.length - 1);

  const pts = data.map((v, i) => ({
    x: i * step,
    y: pad + (1 - (v - min) / range) * (height - pad * 2),
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const areaPath = [
    linePath,
    `L ${pts[pts.length - 1].x.toFixed(2)} ${height}`,
    `L 0 ${height}`,
    "Z",
  ].join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${fillId})`} />
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--outline-variant)" strokeWidth="0.75" strokeDasharray="2 4" />
      <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MockBadge() {
  return (
    <span
      title="This value is mocked — not yet persisted in Firestore."
      className="ml-2 inline-block px-1.5 py-px text-[8px] font-bold tracking-[0.18em] uppercase bg-signal-neutral/20 text-on-surface rounded-sm"
    >
      Mock
    </span>
  );
}

function TickerRow({ ticker }: { ticker: MarketTile }) {
  const positive = ticker.changePct >= 0;
  const color = positive ? "text-signal-bullish" : "text-signal-bearish";
  const arrow = positive ? "▲" : "▼";
  const isSector = ticker.kind === "sector";

  return (
    <div className="group flex items-center gap-5 py-3.5 transition-colors hover:bg-surface-container-low/50 -mx-4 px-4 rounded-sm">
      {/* Label */}
      <div className="w-[140px] shrink-0 min-w-0">
        <div className="flex items-center gap-0.5">
          <span className="text-[13px] font-semibold text-on-surface truncate leading-tight">
            {ticker.label}
          </span>
          <InfoTooltip tile={ticker} />
          {ticker.mocked && <MockBadge />}
        </div>
        {ticker.sublabel && (
          <div className="text-[9.5px] font-bold tracking-[0.14em] uppercase text-outline mt-0.5">
            {ticker.sublabel}
          </div>
        )}
      </div>

      {/* Sparkline */}
      <div className="flex-1 flex justify-center">
        <Sparkline data={ticker.series} positive={positive} />
      </div>

      {/* Price + Change */}
      <div className="text-right shrink-0 w-[90px]">
        {!isSector && (
          <div className="text-[13px] font-semibold text-on-surface tabular-nums font-mono leading-tight">
            {formatPrice(ticker.price, ticker.currency)}
          </div>
        )}
        <div className={`text-[11.5px] font-bold tabular-nums font-mono leading-tight mt-0.5 ${color}`}>
          {arrow} {Math.abs(ticker.changePct).toFixed(2)}%
        </div>
      </div>
    </div>
  );
}

function TileGrid({ tiles }: { tiles: MarketTile[] }) {
  const rowCount = Math.ceil(tiles.length / 3);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 divide-y divide-outline-variant/20 md:divide-y-0">
      {tiles.map((t, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const isLastRow = row === rowCount - 1;
        const isLastCol = col === 2 || i === tiles.length - 1;
        return (
          <div
            key={t.id}
            className={[
              "px-4",
              col < 2 && !isLastCol ? "md:border-r md:border-outline-variant/20" : "",
              !isLastRow ? "md:border-b md:border-outline-variant/20" : "",
              row > 0 ? "md:pt-1" : "",
            ].join(" ")}
          >
            <TickerRow ticker={t} />
          </div>
        );
      })}
    </div>
  );
}

export function MarketAndSectors({
  tiles,
  market,
  sectorSlugMap = {},
  sectorsInHero = false,
}: {
  tiles: MarketTile[];
  market?: string;
  sectorSlugMap?: SectorSlugMap;
  /** When true, sector treemap is shown in the hero card — skip duplicate here */
  sectorsInHero?: boolean;
}) {
  const isIN = market === "IN";

  const macroTiles = tiles.filter((t) => t.kind === "index" || t.kind === "macro");
  const sectorTiles = tiles
    .filter((t) => t.kind === "sector")
    .filter((t) => !isIN || !t.label.toLowerCase().includes("metal"));

  const showMacro = !isIN && macroTiles.length > 0;
  const showSectors = sectorTiles.length > 0 && !sectorsInHero;

  if (!showMacro && !showSectors) {
    return null;
  }

  return (
    <section className="bg-surface-container-lowest brutalist-border overflow-hidden">
      {/* Market Cues — US only */}
      {showMacro && (
        <>
          <div className="px-6 pt-5 pb-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-0.5 h-3.5 bg-primary rounded-full" />
              <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-on-surface-variant">
                Market Cues
              </h3>
            </div>
          </div>
          <div className="px-2">
            <TileGrid tiles={macroTiles} />
          </div>
        </>
      )}

      {/* Sectors */}
      {showSectors && (
        <>
          <div className={`mx-6 mb-1 ${showMacro ? "mt-4 pt-4 border-t border-outline-variant/30" : "mt-5 pt-0"}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-0.5 h-3.5 bg-secondary rounded-full" />
              <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-on-surface-variant">
                Sectors
              </h3>
            </div>
          </div>
          <MarketSectorTreemap tiles={sectorTiles} sectorSlugMap={sectorSlugMap} />
        </>
      )}
    </section>
  );
}
