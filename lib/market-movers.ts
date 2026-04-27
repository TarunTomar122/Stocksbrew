import type { DashboardRow, SectorFlow, SnapshotRow } from "@/lib/types";

const SECTOR_LABELS: Record<string, string> = {
  tech: "Technology",
  ai: "AI & Semis",
  healthcare: "Health Care",
  finance: "Financials",
  consumer: "Consumer",
  industrials: "Industrials",
  energy: "Energy",
  auto: "Auto & Travel",
  defense: "Defense",
  telecom: "Communications",
  crypto: "Crypto",
};

const MIN_SECTOR_SAMPLES = 3;

function snapshotToRow(row: SnapshotRow): DashboardRow | null {
  const pct = row.price?.changePct;
  const current = row.price?.current;
  if (typeof pct !== "number" || typeof current !== "number") return null;
  return {
    instrument_id: row.instrumentId,
    ticker: row.symbol,
    name: row.name || row.symbol,
    price: current,
    day_change_pct: pct,
    ai_sentiment_score: 0,
    news_count: 0,
    source_count: 0,
  };
}

export function buildMoversFromSnapshot(
  rows: SnapshotRow[],
  limit = 5,
): { gainers: DashboardRow[]; losers: DashboardRow[] } {
  const mapped = rows
    .map(snapshotToRow)
    .filter((r): r is DashboardRow => r !== null);
  const sorted = [...mapped].sort(
    (a, b) => b.day_change_pct - a.day_change_pct,
  );
  const gainers = sorted.filter((r) => r.day_change_pct > 0).slice(0, limit);
  const losers = [...sorted]
    .reverse()
    .filter((r) => r.day_change_pct < 0)
    .slice(0, limit);
  return { gainers, losers };
}

export function buildSectorFlowsFromSnapshot(
  rows: SnapshotRow[],
  limit = 7,
): SectorFlow[] {
  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    const pct = row.price?.changePct;
    const id = row.sectorId;
    if (typeof pct !== "number" || !id) continue;
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id)!.push(pct);
  }

  const flows: SectorFlow[] = [];
  for (const [id, values] of buckets.entries()) {
    if (values.length < MIN_SECTOR_SAMPLES) continue;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const direction: SectorFlow["direction"] =
      avg > 0.25 ? "up" : avg < -0.25 ? "down" : "flat";
    flows.push({
      sector: SECTOR_LABELS[id] ?? id,
      flow_pct: Number(avg.toFixed(2)),
      direction,
    });
  }

  flows.sort((a, b) => Math.abs(b.flow_pct) - Math.abs(a.flow_pct));
  return flows.slice(0, limit);
}
