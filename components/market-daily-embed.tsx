"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MarketDailyEdition } from "@/lib/market-daily";

import styles from "@/app/market-daily/market-daily.module.css";

type Marker =
  | "{{INDEX_CHART}}"
  | "{{SECTOR_CHART}}"
  | "{{MARKET_PULSE}}"
  | "{{PREMARKET_BOARD}}"
  | "{{MOVER_CARDS}}"
  | "{{ANOMALY_RAIL}}";

type Props = {
  marker: Marker;
  edition: MarketDailyEdition;
};

function signed(value: number | null | undefined, digits = 2): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  return `${number >= 0 ? "+" : ""}${number.toFixed(digits)}%`;
}

function tone(value: number | null | undefined): string {
  const number = Number(value);
  if (number > 0) return styles.embedPositive;
  if (number < 0) return styles.embedNegative;
  return styles.embedFlat;
}

function shortDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00Z`);
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function IndexChart({ edition }: { edition: MarketDailyEdition }) {
  const data = edition.tape.charts?.index_history || [];
  return (
    <figure className={styles.storyGraphic}>
      <figcaption className={styles.graphicHeader}>
        <div>
          <span className={styles.graphicEyebrow}>The shape of the argument</span>
          <strong>Major indexes, rebased across the last 30 sessions</strong>
        </div>
        <span>Hover for the daily gap</span>
      </figcaption>
      <div className={styles.chartCanvas}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--outline-variant)" strokeDasharray="2 5" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              minTickGap={34}
              tick={{ fill: "var(--on-surface-variant)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
              tick={{ fill: "var(--on-surface-variant)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              labelFormatter={(value) => shortDate(String(value))}
              formatter={(value, name) => [signed(Number(value)), String(name)]}
              contentStyle={{ background: "var(--inverse-surface)", border: 0, color: "var(--inverse-on-surface)", borderRadius: 2 }}
              itemStyle={{ color: "var(--inverse-on-surface)" }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Line
              dataKey="sp500"
              name="S&P 500"
              stroke="var(--on-surface)"
              strokeWidth={2.4}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              dataKey="nasdaq"
              name="Nasdaq"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              dataKey="russell"
              name="Russell 2000"
              stroke="var(--signal-neutral)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className={styles.graphicNote}>
        Each line starts at zero so leadership changes are visible without index-level noise.
      </p>
    </figure>
  );
}

const windows = {
  session_change_pct: "Session",
  "5_session_change_pct": "5 sessions",
  "20_session_change_pct": "20 sessions",
} as const;

function SectorChart({ edition }: { edition: MarketDailyEdition }) {
  const [windowKey, setWindowKey] = useState<keyof typeof windows>("session_change_pct");
  const data = useMemo(
    () =>
      [...(edition.tape.charts?.sector_performance || [])]
        .sort((left, right) => Number(right[windowKey] || 0) - Number(left[windowKey] || 0))
        .map((row) => ({ ...row, value: row[windowKey] })),
    [edition.tape.charts?.sector_performance, windowKey],
  );

  return (
    <figure className={styles.storyGraphic}>
      <figcaption className={styles.graphicHeader}>
        <div>
          <span className={styles.graphicEyebrow}>Rotation, not a roll call</span>
          <strong>Where sector leadership actually moved</strong>
        </div>
        <div className={styles.windowSwitch} aria-label="Sector chart period">
          {(Object.keys(windows) as Array<keyof typeof windows>).map((key) => (
            <button
              type="button"
              key={key}
              className={key === windowKey ? styles.windowActive : ""}
              onClick={() => setWindowKey(key)}
            >
              {windows[key]}
            </button>
          ))}
        </div>
      </figcaption>
      <div className={styles.sectorChartCanvas}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 18 }}>
            <CartesianGrid stroke="var(--outline-variant)" strokeDasharray="2 5" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
              tick={{ fill: "var(--on-surface-variant)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey="label"
              type="category"
              width={112}
              tick={{ fill: "var(--on-surface)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value) => [signed(Number(value)), windows[windowKey]]}
              contentStyle={{ background: "var(--inverse-surface)", border: 0, color: "var(--inverse-on-surface)", borderRadius: 2 }}
              itemStyle={{ color: "var(--inverse-on-surface)" }}
            />
            <Bar dataKey="value" radius={2}>
              {data.map((row) => (
                <Cell
                  key={row.label}
                  fill={
                    Number(row.value) > 0
                      ? "var(--signal-bullish)"
                      : Number(row.value) < 0
                        ? "var(--signal-bearish)"
                        : "var(--signal-neutral)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function MarketPulse({ edition }: { edition: MarketDailyEdition }) {
  const rows = edition.tape.markets.filter((row) => row.group === "macro").slice(0, 5);
  return (
    <aside className={styles.inlinePanel}>
      <div className={styles.inlinePanelHeader}>
        <span>Cross-market pulse</span>
        <small>{edition.previous_session_date} close</small>
      </div>
      <div className={styles.pulseGrid}>
        {rows.map((row) => (
          <div className={styles.pulseItem} key={row.symbol}>
            <span>{row.label}</span>
            <strong className={tone(row.change_pct)}>{signed(row.change_pct)}</strong>
            <small>{Number(row.close).toLocaleString("en-US", { maximumFractionDigits: 2 })}</small>
          </div>
        ))}
      </div>
    </aside>
  );
}

function PremarketBoard({ edition }: { edition: MarketDailyEdition }) {
  return (
    <aside className={styles.inlinePanel}>
      <div className={styles.inlinePanelHeader}>
        <span>Before the bell</span>
        <small>live snapshot</small>
      </div>
      <div className={styles.premarketGrid}>
        {edition.premarket.futures.slice(0, 3).map((row) => (
          <div className={styles.futureItem} key={row.symbol}>
            <span>{row.label}</span>
            <strong className={tone(row.change_pct)}>{signed(row.change_pct)}</strong>
          </div>
        ))}
      </div>
    </aside>
  );
}

function MoverCards({ edition }: { edition: MarketDailyEdition }) {
  const movers = [...edition.premarket.movers]
    .sort((left, right) => Math.abs(Number(right.change_pct || 0)) - Math.abs(Number(left.change_pct || 0)))
    .slice(0, 4);
  if (!movers.length) return null;
  return (
    <aside className={styles.moverBlock}>
      <div className={styles.inlinePanelHeader}>
        <span>Stocks making the morning personal</span>
        <small>premarket</small>
      </div>
      <div className={styles.moverGrid}>
        {movers.map((mover) => (
          <Link
            className={styles.moverCard}
            href={`/stock/${encodeURIComponent(mover.ticker)}`}
            key={mover.ticker}
          >
            <div>
              <strong>{mover.ticker}</strong>
              <span>{mover.name || mover.sector || "US equity"}</span>
            </div>
            <b className={tone(mover.change_pct)}>{signed(mover.change_pct)}</b>
          </Link>
        ))}
      </div>
    </aside>
  );
}

const anomalyViews = {
  unusual: "Unusual",
  gainers: "Gainers",
  losers: "Losers",
} as const;

function AnomalyRail({ edition }: { edition: MarketDailyEdition }) {
  const [view, setView] = useState<keyof typeof anomalyViews>("unusual");
  const rows = edition.anomalies?.[view] || [];
  if (!rows.length) return null;
  return (
    <aside className={styles.moverBlock}>
      <div className={styles.anomalyHeader}>
        <div>
          <span className={styles.graphicEyebrow}>Session outliers</span>
          <strong>Where the tape broke from the crowd</strong>
          <small>{edition.anomalies.session_date} close</small>
        </div>
        <div className={styles.windowSwitch} aria-label="Mover group">
          {(Object.keys(anomalyViews) as Array<keyof typeof anomalyViews>).map((key) => (
            <button
              type="button"
              key={key}
              className={key === view ? styles.windowActive : ""}
              onClick={() => setView(key)}
            >
              {anomalyViews[key]}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.anomalyGrid}>
        {rows.slice(0, 5).map((row) => (
          <Link
            className={styles.anomalyCard}
            href={`/stock/${encodeURIComponent(row.ticker)}`}
            key={`${view}-${row.ticker}`}
          >
            <div className={styles.anomalyIdentity}>
              <strong>{row.ticker}</strong>
              <span>{row.name || row.sector || "US equity"}</span>
            </div>
            <div className={styles.anomalyMove}>
              <b className={tone(row.day_change_pct)}>{signed(row.day_change_pct)}</b>
              {Number(row.volume_ratio) > 0 ? (
                <small>{Number(row.volume_ratio).toFixed(1)}× volume</small>
              ) : null}
            </div>
            <p>{row.explanation || "No clean company-specific trigger was confirmed."}</p>
            <span className={styles.anomalyArrow} aria-hidden="true">↗</span>
          </Link>
        ))}
      </div>
    </aside>
  );
}

export function MarketDailyEmbed({ marker, edition }: Props) {
  if (marker === "{{INDEX_CHART}}") return <IndexChart edition={edition} />;
  if (marker === "{{SECTOR_CHART}}") return <SectorChart edition={edition} />;
  if (marker === "{{MARKET_PULSE}}") return <MarketPulse edition={edition} />;
  if (marker === "{{PREMARKET_BOARD}}") return <PremarketBoard edition={edition} />;
  if (marker === "{{ANOMALY_RAIL}}") return <AnomalyRail edition={edition} />;
  return <MoverCards edition={edition} />;
}
