import { NextRequest, NextResponse } from "next/server";
import { adminFirestore, adminAuth } from "@/lib/firebase-admin";

const COLLECTION = "tm_alerts";

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
  if (!email) return NextResponse.json({ error: "No email on account — add one in your profile" }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const instrumentId = typeof body.instrument_id === "string" ? body.instrument_id.trim() : "";
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  const condition = body.condition;
  const targetPrice = typeof body.target_price === "number" ? body.target_price : NaN;
  const directiveText = typeof body.directive_text === "string" ? body.directive_text.trim() : "";

  if (!instrumentId || !ticker) return NextResponse.json({ error: "Missing instrument_id or ticker" }, { status: 400 });
  if (condition !== "below" && condition !== "above") return NextResponse.json({ error: "condition must be 'below' or 'above'" }, { status: 400 });
  if (!isFinite(targetPrice) || targetPrice <= 0) return NextResponse.json({ error: "Invalid target_price" }, { status: 400 });

  // One active alert per stock per user
  const existing = await adminFirestore
    .collection(COLLECTION)
    .where("uid", "==", uid)
    .where("instrument_id", "==", instrumentId)
    .where("active", "==", true)
    .limit(1)
    .get();
  if (!existing.empty) {
    return NextResponse.json({ error: "You already have an alert on this stock" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const doc = await adminFirestore.collection(COLLECTION).add({
    uid,
    email,
    instrument_id: instrumentId,
    ticker,
    condition,
    target_price: targetPrice,
    directive_text: directiveText,
    active: true,
    triggered: false,
    created_at: now,
  });

  return NextResponse.json({ ok: true, alert_id: doc.id });
}

export async function GET(req: NextRequest) {
  const decoded = await getSessionUser(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snap = await adminFirestore
    .collection(COLLECTION)
    .where("uid", "==", decoded.uid)
    .where("active", "==", true)
    .orderBy("created_at", "desc")
    .limit(20)
    .get();

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

  await adminFirestore.collection(COLLECTION).doc(alertId).update({ active: false });
  return NextResponse.json({ ok: true });
}
