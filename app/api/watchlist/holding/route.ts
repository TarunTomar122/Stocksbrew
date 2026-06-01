import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { getUserDoc } from "@/lib/watchlist";

const INSTRUMENT_ID_RE = /^(US|IN)_[A-Z0-9_]+$/;

function asNumber(value: unknown, max: number): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return undefined;
  return n;
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const instrumentId = typeof body?.instrument_id === "string" ? body.instrument_id.trim().toUpperCase() : "";
  if (!INSTRUMENT_ID_RE.test(instrumentId)) {
    return NextResponse.json({ error: "invalid_instrument_id" }, { status: 400 });
  }

  const quantity = asNumber(body?.quantity, 1_000_000_000);
  const marketValue = asNumber(body?.market_value, 1_000_000_000_000);
  const averageCost = asNumber(body?.average_cost, 1_000_000_000);
  if (quantity === undefined || marketValue === undefined || averageCost === undefined) {
    return NextResponse.json({ error: "invalid_holding_values" }, { status: 400 });
  }

  const userDoc = await getUserDoc(session.uid);
  if (!userDoc) return NextResponse.json({ error: "profile_not_ready" }, { status: 409 });
  const tracked = new Set(Array.isArray(userDoc.tracked_stocks) ? userDoc.tracked_stocks : []);
  if (!tracked.has(instrumentId)) {
    return NextResponse.json({ error: "not_tracked" }, { status: 409 });
  }
  const position = (userDoc.watchlist_positions || {})[instrumentId];
  if (position !== "holding") {
    return NextResponse.json({ error: "not_holding" }, { status: 409 });
  }

  const currencyRaw = typeof body?.currency === "string" ? body.currency.trim().toUpperCase() : "";
  const currency = currencyRaw || (instrumentId.startsWith("IN_") ? "INR" : "USD");
  const sourceRaw = typeof body?.source === "string" ? body.source.trim().toLowerCase() : "";
  const source = sourceRaw === "manual" || sourceRaw === "screenshot" || sourceRaw === "unknown" ? sourceRaw : "manual";
  const now = new Date().toISOString();
  const nextVersion = Number(userDoc.watchlist_version || 0) + 1;

  await adminFirestore.collection("users").doc(session.uid).set(
    {
      watchlist_holdings: {
        [instrumentId]: {
          quantity: quantity ?? null,
          market_value: marketValue ?? null,
          average_cost: averageCost ?? null,
          currency,
          source,
          updated_at: now,
        },
      },
      watchlist_version: nextVersion,
      watchlist_updated_at: now,
    },
    { merge: true },
  );

  await adminFirestore.collection("tm_watchlist_view_refresh_control").doc(session.uid).set(
    {
      last_source_version: nextVersion,
      last_requested_at: now,
      requested_by: "holding_patch",
      updated_at: now,
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true, source_version: nextVersion });
}

