import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { newYorkToday } from "@/lib/portfolio-data";
import { computeInstrument, parseTaxLotEntry, tickerOf, type TaxLotEntry } from "@/lib/portfolio-tax";

/**
 * Saves one stock's tax lots (buys, sells, splits) for the signed-in user.
 *
 * Writes only `users/{uid}.tax_lots[instrument_id]` and `tax_lots_updated_at`.
 * The whole `tax_lots` map is read and written back inside a transaction with
 * just that one stock replaced: LocalDB's merge replaces a top-level map
 * rather than merging into it, so sending only the one key would drop the
 * user's other stocks. `watchlist_holdings` and every other field are left
 * as they are.
 */

const INSTRUMENT_ID_RE = /^US_[A-Z0-9_]{1,24}$/;
const MAX_STOCKS = 400;
const MAX_FIELD_BYTES = 600_000;

export async function PUT(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const instrumentId = typeof body.instrument_id === "string" ? body.instrument_id.trim().toUpperCase() : "";
  if (!INSTRUMENT_ID_RE.test(instrumentId)) {
    return NextResponse.json({ error: "invalid_instrument_id", message: "Tax lots are for US stocks only." }, { status: 400 });
  }

  const today = newYorkToday();
  const ticker = tickerOf(instrumentId);
  const { entry, errors } = parseTaxLotEntry(body, today, ticker);
  if (errors.length > 0) {
    return NextResponse.json({ error: "invalid_lots", message: errors.slice(0, 6).join(" "), errors }, { status: 400 });
  }
  const oversold = computeInstrument(instrumentId, entry).issues.find((issue) => issue.kind === "oversold");
  if (oversold) {
    return NextResponse.json(
      {
        error: "oversold",
        message: `The sell on ${oversold.date} is ${Number(oversold.shares.toFixed(6))} shares more than the buys before it. Add the missing buy first.`,
      },
      { status: 400 },
    );
  }

  const userRef = adminFirestore.collection("users").doc(session.uid);
  const now = new Date().toISOString();
  const stored: TaxLotEntry = { ...entry, ticker, updated_at: now };

  try {
    const outcome = await adminFirestore.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return "profile_not_ready" as const;
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const tracked = new Set(Array.isArray(data.tracked_stocks) ? (data.tracked_stocks as string[]) : []);
      const current =
        data.tax_lots && typeof data.tax_lots === "object" && !Array.isArray(data.tax_lots)
          ? (data.tax_lots as Record<string, unknown>)
          : {};
      // Lots can be added for a stock in Portfolio, and edited later even after it leaves Portfolio.
      if (!tracked.has(instrumentId) && !(instrumentId in current)) return "not_tracked" as const;
      if (!(instrumentId in current) && Object.keys(current).length >= MAX_STOCKS) return "too_many" as const;
      const next = { ...current, [instrumentId]: stored };
      // Keeps the user doc a sensible size (Firestore caps a document at 1 MiB).
      if (JSON.stringify(next).length > MAX_FIELD_BYTES) return "too_big" as const;
      tx.set(userRef, { tax_lots: next, tax_lots_updated_at: now }, { merge: true });
      return "ok" as const;
    });
    if (outcome === "profile_not_ready") return NextResponse.json({ error: outcome }, { status: 409 });
    if (outcome === "not_tracked") {
      return NextResponse.json({ error: outcome, message: "Add the stock to Portfolio first." }, { status: 409 });
    }
    if (outcome === "too_big") {
      return NextResponse.json({ error: outcome, message: "That is more lots than we can keep in one account. Nothing was changed." }, { status: 413 });
    }
    if (outcome === "too_many") {
      return NextResponse.json({ error: outcome, message: `Lots can be kept for up to ${MAX_STOCKS} stocks.` }, { status: 409 });
    }
  } catch {
    return NextResponse.json({ error: "save_failed", message: "Could not save. Nothing was changed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated_at: now });
}
