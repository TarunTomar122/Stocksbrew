import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";

function cleanTicker(value: string): string {
  return String(value || "").trim().toUpperCase().slice(0, 16);
}

function cleanInstrumentId(value: string): string {
  return String(value || "").trim().toUpperCase().slice(0, 40);
}

function cleanAnonId(value: string): string {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 64);
}

function docSafe(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
}

const US_OVERRIDE_CAP = 500;
const IN_OVERRIDE_CAP = 250;

async function maybePromoteOnFirstVisit(instrumentId: string, ticker: string, market: "US" | "IN") {
  const firstVisitRef = adminFirestore.collection("tm_stock_first_views").doc(instrumentId);
  try {
    await firstVisitRef.create({
      instrument_id: instrumentId,
      ticker,
      market,
      created_at: new Date().toISOString(),
    });
  } catch {
    return;
  }

  const configRef = adminFirestore.collection("tm_config").doc("price_core_overrides");
  await adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(configRef);
    const data = snap.exists ? (snap.data() ?? {}) : {};
    const current = Array.isArray(data?.[market]) ? (data[market] as unknown[]) : [];
    const normalized: string[] = [];
    const seen = new Set<string>();
    for (const raw of current) {
      const iid = cleanInstrumentId(String(raw || ""));
      if (!iid || seen.has(iid)) continue;
      seen.add(iid);
      normalized.push(iid);
    }
    if (!seen.has(instrumentId)) normalized.push(instrumentId);
    const cap = market === "US" ? US_OVERRIDE_CAP : IN_OVERRIDE_CAP;
    const capped = normalized.slice(Math.max(0, normalized.length - cap));
    tx.set(
      configRef,
      {
        [market]: capped,
        updated_at: new Date().toISOString(),
      },
      { merge: true },
    );
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();

  const body = await req.json().catch(() => ({}));
  const ticker = cleanTicker(String(body?.ticker || ""));
  const instrumentId = cleanInstrumentId(String(body?.instrument_id || ""));
  const anonId = cleanAnonId(String(body?.anon_id || ""));
  const market = body?.market === "IN" ? "IN" : "US";

  if (!ticker || !instrumentId) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  if (!session && !anonId) return NextResponse.json({ ok: true });

  const now = new Date();
  const bucketHour = now.toISOString().slice(0, 13);
  const actorId = session?.uid ? `u_${session.uid}` : `a_${anonId}`;
  const docId = docSafe(`${actorId}_${instrumentId}_${bucketHour}`);

  await adminFirestore.collection("tm_stock_views").doc(docId).set({
    uid: session?.uid ?? null,
    anon_id: session ? null : anonId,
    email: session?.email ?? null,
    ticker,
    instrument_id: instrumentId,
    market,
    bucket_hour: bucketHour,
    view_count: FieldValue.increment(1),
    created_at: `${bucketHour}:00:00.000Z`,
    updated_at: now.toISOString(),
  }, { merge: true });

  await maybePromoteOnFirstVisit(instrumentId, ticker, market).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
