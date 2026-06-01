import { cache } from "react";

import { adminFirestore } from "@/lib/firebase-admin";
import { getInstrument, getInstruments } from "@/lib/firestore";
import type { Instrument } from "@/lib/types";

export type ResolvedInstrument = {
  instrument_id: string;
  ticker: string;
  name: string;
  market: "US" | "IN";
};

function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

function toResolved(instrument: Instrument): ResolvedInstrument {
  return {
    instrument_id: instrument.instrument_id,
    ticker: instrument.ticker,
    name: instrument.name || instrument.ticker,
    market: instrument.market,
  };
}

async function resolveInstrumentByTickerUncached(
  tickerOrInstrumentId: string,
  market: "US" | "IN" = "US",
): Promise<ResolvedInstrument | null> {
  const raw = tickerOrInstrumentId.trim().toUpperCase();
  if (raw.startsWith("US_") || raw.startsWith("IN_")) {
    const direct = await getInstrument(raw).catch(() => null);
    return direct ? toResolved(direct) : null;
  }

  const normalized = normalizeTicker(tickerOrInstrumentId);
  if (!normalized) return null;

  const instrumentId = `${market}_${normalized}`;
  const direct = await getInstrument(instrumentId).catch(() => null);
  if (direct) return toResolved(direct);

  const byTicker = await adminFirestore
    .collection("tm_instruments")
    .where("market", "==", market)
    .where("ticker", "==", normalized)
    .limit(1)
    .get();
  const tickerDoc = byTicker.docs[0];
  if (tickerDoc?.exists) return toResolved(tickerDoc.data() as Instrument);

  const bySymbol = await adminFirestore
    .collection("tm_instruments")
    .where("market", "==", market)
    .where("symbol", "==", normalized)
    .limit(1)
    .get();
  const symbolDoc = bySymbol.docs[0];
  if (symbolDoc?.exists) return toResolved(symbolDoc.data() as Instrument);

  return null;
}

export const resolveInstrumentByTicker = cache(resolveInstrumentByTickerUncached);

export async function getInstrumentLabels(
  instrumentIds: string[],
): Promise<Map<string, Pick<ResolvedInstrument, "ticker" | "name">>> {
  const instruments = await getInstruments(instrumentIds);
  const labels = new Map<string, Pick<ResolvedInstrument, "ticker" | "name">>();
  for (const [id, instrument] of instruments.entries()) {
    labels.set(id, {
      ticker: instrument.ticker,
      name: instrument.name || instrument.ticker,
    });
  }
  return labels;
}
