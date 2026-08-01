import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import {
  createStockAlert,
  deleteStockAlert,
  isAlertKind,
  listStockAlerts,
  StockAlertError,
} from "@/lib/stock-alerts";

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

  const userDoc = await getUserDoc(uid).catch(() => null);
  if (!resolveIsSubscribed(userDoc)) {
    return NextResponse.json(
      { error: "pro_required", message: "Pro is required to create stock alerts." },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const instrumentId = typeof body.instrument_id === "string" ? body.instrument_id.trim() : "";
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  const kindRaw = typeof body.kind === "string" ? body.kind.trim().toLowerCase() : "price_threshold";
  const kind = isAlertKind(kindRaw) ? kindRaw : "price_threshold";
  const condition = body.condition;
  const targetPrice = typeof body.target_price === "number" ? body.target_price : NaN;
  const directiveText = typeof body.directive_text === "string" ? body.directive_text.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const metadata = typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {};

  try {
    const created = await createStockAlert({
      uid,
      email,
      instrumentId,
      ticker,
      kind,
      condition: condition === "above" ? "above" : condition === "below" ? "below" : undefined,
      targetPrice,
      directiveText,
      note,
      metadata: metadata as Record<string, unknown>,
    });
    return NextResponse.json({ ok: true, ...created });
  } catch (error) {
    if (error instanceof StockAlertError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function GET(req: NextRequest) {
  const decoded = await getSessionUser(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const kindFilter = (url.searchParams.get("kind") || "").trim().toLowerCase();
  const instrumentFilter = (url.searchParams.get("instrument_id") || "").trim();

  const alerts = await listStockAlerts(decoded.uid, { instrumentId: instrumentFilter, kind: kindFilter });
  return NextResponse.json({ alerts });
}

export async function DELETE(req: NextRequest) {
  const decoded = await getSessionUser(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const alertId = url.searchParams.get("id");
  if (!alertId) return NextResponse.json({ error: "Missing alert id" }, { status: 400 });

  try {
    await deleteStockAlert(decoded.uid, alertId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof StockAlertError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
