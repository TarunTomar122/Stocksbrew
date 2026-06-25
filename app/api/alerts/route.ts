import { NextRequest, NextResponse } from "next/server";
import { adminFirestore, adminAuth } from "@/lib/firebase-admin";

const COLLECTION = "tm_alerts";
const ALERT_KINDS = new Set([
  "price_threshold",
  "anomaly",
  "rsi_extreme",
  "earnings_24h",
  "directive_change",
  "news_velocity",
] as const);
type AlertKind = "price_threshold" | "anomaly" | "rsi_extreme" | "earnings_24h" | "directive_change" | "news_velocity";
type PriceCondition = "below" | "above";

async function getSessionUser(req: NextRequest) {
  try {
    const cookie = req.cookies.get("tikrr_session")?.value;
    if (!cookie) return null;
    const decoded = await adminAuth.verifySessionCookie(cookie, true);
    return decoded;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const decoded = await getSessionUser(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const uid = decoded.uid;
  const email = decoded.email ?? null;
  if (!email) return NextResponse.json({ error: "No email on account - add one in your profile" }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const instrumentId = typeof body.instrument_id === "string" ? body.instrument_id.trim() : "";
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  const kindRaw = typeof body.kind === "string" ? body.kind.trim().toLowerCase() : "price_threshold";
  const kind: AlertKind = ALERT_KINDS.has(kindRaw as AlertKind) ? (kindRaw as AlertKind) : "price_threshold";
  const condition = body.condition;
  const targetPrice = typeof body.target_price === "number" ? body.target_price : NaN;
  const directiveText = typeof body.directive_text === "string" ? body.directive_text.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const metadata = typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {};

  if (!instrumentId || !ticker) return NextResponse.json({ error: "Missing instrument_id or ticker" }, { status: 400 });
  const isPriceThreshold = kind === "price_threshold";
  if (isPriceThreshold) {
    if (condition !== "below" && condition !== "above") {
      return NextResponse.json({ error: "condition must be 'below' or 'above'" }, { status: 400 });
    }
    if (!isFinite(targetPrice) || targetPrice <= 0) {
      return NextResponse.json({ error: "Invalid target_price" }, { status: 400 });
    }
  }

  // One active alert per stock + kind + user
  const existingQuery = await adminFirestore
    .collection(COLLECTION)
    .where("uid", "==", uid)
    .where("instrument_id", "==", instrumentId)
    .where("kind", "==", kind)
    .where("active", "==", true)
    .limit(20)
    .get();
  if (!existingQuery.empty) {
    if (isPriceThreshold) {
      const duplicate = existingQuery.docs.find((d) => {
        const row = d.data() as { condition?: string; target_price?: number };
        return row.condition === condition && Number(row.target_price ?? NaN) === targetPrice;
      });
      if (duplicate) {
        return NextResponse.json({ error: "You already have this price alert" }, { status: 409 });
      }
    } else {
      return NextResponse.json({ error: "You already have this alert type on this stock" }, { status: 409 });
    }
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    uid,
    email,
    instrument_id: instrumentId,
    ticker,
    kind,
    note,
    metadata,
    active: true,
    triggered: false,
    created_at: now,
    updated_at: now,
  };
  if (isPriceThreshold) {
    payload.condition = condition as PriceCondition;
    payload.target_price = targetPrice;
    payload.directive_text = directiveText;
  } else if (directiveText) {
    payload.directive_text = directiveText;
  }

  const doc = await adminFirestore.collection(COLLECTION).add({
    ...payload,
  });

  return NextResponse.json({ ok: true, alert_id: doc.id, kind });
}

export async function GET(req: NextRequest) {
  const decoded = await getSessionUser(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const kindFilter = (url.searchParams.get("kind") || "").trim().toLowerCase();
  const instrumentFilter = (url.searchParams.get("instrument_id") || "").trim();

  let query = adminFirestore
    .collection(COLLECTION)
    .where("uid", "==", decoded.uid)
    .where("active", "==", true);

  if (instrumentFilter) {
    query = query.where("instrument_id", "==", instrumentFilter);
  }
  if (ALERT_KINDS.has(kindFilter as AlertKind)) {
    query = query.where("kind", "==", kindFilter);
  }

  const snap = await query.orderBy("created_at", "desc").limit(50).get();
  const alerts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ alerts });
}

export async function DELETE(req: NextRequest) {
  const decoded = await getSessionUser(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const alertId = url.searchParams.get("id");
  if (!alertId) return NextResponse.json({ error: "Missing alert id" }, { status: 400 });

  const doc = await adminFirestore.collection(COLLECTION).doc(alertId).get();
  if (!doc.exists || doc.data()?.uid !== decoded.uid) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  await adminFirestore.collection(COLLECTION).doc(alertId).update({
    active: false,
    updated_at: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
