import type { PriceHistoryPoint } from "@/lib/price-history-chart";

export const LANDING_HERO_CHART_MIN = 20;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function tradingDaysEnding(endIso: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${endIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return [];

  while (out.length < count) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.unshift(dayKey(d));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

function addTradingDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  let remaining = Math.abs(delta);
  const step = delta < 0 ? -1 : 1;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    remaining -= 1;
  }
  return dayKey(d);
}

function ms(iso: string): number {
  return new Date(`${iso}T12:00:00`).getTime();
}

function interpolateClose(date: string, anchors: PriceHistoryPoint[]): number {
  const sorted = [...anchors].sort((a, b) => a.date.localeCompare(b.date));
  const t = ms(date);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const t0 = ms(first.date);
  const t1 = ms(last.date);

  if (t <= t0) return first.close;
  if (t >= t1) return last.close;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const ta = ms(a.date);
    const tb = ms(b.date);
    if (t >= ta && t <= tb) {
      const span = tb - ta;
      const u = span === 0 ? 1 : (t - ta) / span;
      return a.close + (b.close - a.close) * u;
    }
  }
  return last.close;
}

function synthWiggle(index: number, price: number): number {
  return Math.sin(index * 2.17 + price * 0.03) * 0.008 * price;
}

/** Fill sparse hero chart history so the landing sparkline always has enough points. */
export function resolveLandingHeroChartSeries(
  history: PriceHistoryPoint[],
  price: number,
  dayChangePct: number,
  minPoints = LANDING_HERO_CHART_MIN,
): PriceHistoryPoint[] {
  if (!Number.isFinite(price) || price <= 0) return [];

  const today = dayKey(new Date());
  const byDate = new Map<string, number>();
  for (const row of history) {
    if (row.date && Number.isFinite(row.close) && row.close > 0) {
      byDate.set(row.date, row.close);
    }
  }
  byDate.set(today, price);

  let anchors: PriceHistoryPoint[] = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, close]) => ({ date, close }));

  if (anchors.length >= minPoints) {
    return anchors.slice(-63);
  }

  if (anchors.length === 1) {
    const priorDate = addTradingDays(today, -1);
    const priorClose = price / (1 + dayChangePct / 100);
    if (Number.isFinite(priorClose) && priorClose > 0) {
      anchors = [
        { date: priorDate, close: priorClose },
        { date: today, close: price },
      ];
    }
  }

  const dates = tradingDaysEnding(today, minPoints);
  if (dates.length === 0) return anchors;

  const startPrice = anchors[0]!.close;
  const floor = Math.min(startPrice, price) * 0.82;

  return dates.map((date, index) => {
    const pinned = byDate.get(date);
    if (pinned != null) {
      return { date, close: date === today ? price : pinned };
    }

    const t = index / Math.max(dates.length - 1, 1);
    const linear = startPrice + (price - startPrice) * t;
    const base = anchors.length > 2 ? interpolateClose(date, anchors) : linear;
    const close = Math.max(floor, base + synthWiggle(index, price));
    return { date, close: date === today ? price : close };
  });
}
