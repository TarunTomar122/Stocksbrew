import { NextResponse } from "next/server";
import { getLatestPrices, getInstruments } from "@/lib/firestore";
import { getSectorRegimes, slugifySector, REGIME_LABEL, type SectorRegime } from "@/lib/sector-regimes";

export const runtime = "nodejs";

const BULL = new Set(["strong buy", "buy", "outperform", "overweight"]);
const BEAR = new Set(["sell", "strong sell", "underperform", "underweight", "reduce", "hold"]);

type XrayCard = {
  ticker: string;
  name: string;
  sector: string | null;
  crowd_label: string;
  crowd_side: "bull" | "bear";
  our_stance: string;
  our_side: "bull" | "bear" | "neutral";
  reason: string;
  upside_pct: number | null;
};

function call(label: string, upside: number | null): { stance: string; side: "bull" | "bear" | "neutral"; reason: string } | null {
  const l = label.toLowerCase();
  if (BULL.has(l) && l !== "hold" && upside != null && upside <= 3) {
    if (upside <= -8) {
      return {
        stance: upside <= -3 ? "Avoid" : "Trim",
        side: "bear",
        reason: `Analysts say buy, but it is ${Math.abs(Math.round(upside))}% above their own target. You are chasing here.`,
      };
    }
    return { stance: "Trim", side: "bear", reason: "Analysts are bullish, but the upside to their target is used up." };
  }
  if ((l === "hold" || BEAR.has(l)) && upside != null && upside >= 15) {
    return {
      stance: "Accumulate",
      side: "bull",
      reason: `The Street is lukewarm, but there is ${Math.round(upside)}% to the target. We would lean in.`,
    };
  }
  return null;
}

export async function POST(req: Request) {
  let tickers: string[] = [];
  try {
    const body = await req.json();
    tickers = Array.isArray(body?.tickers) ? body.tickers : [];
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const clean = [...new Set(
    tickers.map((t) => String(t || "").trim().toUpperCase()).filter(Boolean),
  )].slice(0, 15);
  if (clean.length === 0) return NextResponse.json({ cards: [], xray: null });

  const ids = clean.map((t) => `US_${t}`);
  const [prices, instruments, regimes] = await Promise.all([
    getLatestPrices(ids).catch(() => new Map()),
    getInstruments(ids).catch(() => new Map()),
    getSectorRegimes("US").catch(() => ({ sectors: new Map(), macro: null })),
  ]);

  const cards: XrayCard[] = [];
  const sectorCounts = new Map<string, number>();

  for (const t of clean) {
    const iid = `US_${t}`;
    const price = prices.get(iid);
    const inst = instruments.get(iid);
    const sector = inst?.sector ?? null;
    if (sector) sectorCounts.set(sector, (sectorCounts.get(sector) ?? 0) + 1);

    const ac = price?.analyst_consensus;
    const current = price?.quote?.current;
    const target = ac?.target_price;
    if (!ac?.label || !current || !target || target <= 0) continue;
    const upside = ((target - current) / current) * 100;
    const verdict = call(ac.label, upside);
    if (!verdict) continue;
    cards.push({
      ticker: t,
      name: inst?.name ?? t,
      sector,
      crowd_label: ac.label,
      crowd_side: BULL.has(ac.label.toLowerCase()) && ac.label.toLowerCase() !== "hold" ? "bull" : "bear",
      our_stance: verdict.stance,
      our_side: verdict.side,
      reason: verdict.reason,
      upside_pct: Math.round(upside * 10) / 10,
    });
  }

  // X-ray flags: concentration + the regime your biggest sector sits in.
  const total = [...sectorCounts.values()].reduce((a, b) => a + b, 0);
  let topSector: string | null = null;
  let topPct = 0;
  for (const [sec, n] of sectorCounts) {
    const pct = total > 0 ? (n / total) * 100 : 0;
    if (pct > topPct) {
      topPct = pct;
      topSector = sec;
    }
  }
  let topRegimeLabel: string | null = null;
  if (topSector) {
    const reg = regimes.sectors.get(slugifySector(topSector));
    if (reg) topRegimeLabel = REGIME_LABEL[reg.regime as SectorRegime] ?? null;
  }

  const xray = {
    offsideCount: cards.length,
    scanned: clean.length,
    topSector,
    topSectorPct: Math.round(topPct),
    topSectorRegime: topRegimeLabel,
  };

  return NextResponse.json({ cards, xray });
}
