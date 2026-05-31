import { NextRequest, NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";
import { FieldValue } from "firebase-admin/firestore";
import { triggerDispatchLane } from "@/lib/cloud-run-dispatch";

const INVALID_REQUEST_TOKENS = new Set([
  "TO",
  "IT",
  "IN",
  "ON",
  "AT",
  "IS",
  "ARE",
  "HTTPS",
  "HTTP",
  "WWW",
  "COM",
  "DIV",
  "HREF",
]);

function isLikelyJunkRequest(query: string): boolean {
  if (!query) return true;
  if (INVALID_REQUEST_TOKENS.has(query)) return true;
  // Block obvious URL/domain-like and noisy tokens.
  if (query.includes("/") || query.includes(":")) return true;
  if (query.endsWith(".COM") || query.endsWith(".NET") || query.endsWith(".ORG")) return true;
  return false;
}

const STOCK_REQUEST_BATCH_LIMIT = 20;

async function triggerStockRequestProcessing(query: string): Promise<void> {
  // Drain the queue in one run (prioritize this ticker). A single --query run
  // only processed one doc and left Pro backlogs stuck for days.
  await triggerDispatchLane({
    lane: "stock_requests",
    market: "US",
    limit: STOCK_REQUEST_BATCH_LIMIT,
    extraArgs: ["--prioritize-query", query],
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const query: string = (body.query ?? "").trim().toUpperCase();

  if (!query || query.length > 20) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  if (isLikelyJunkRequest(query)) {
    return NextResponse.json({ error: "Query does not look like a stock symbol or company name" }, { status: 400 });
  }

  const session = await getSessionUser();

  // Deduplicate: one request per query (case-insensitive), increment count if exists
  const ref = adminFirestore.collection("stock_requests").doc(query);
  await adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      tx.update(ref, {
        count: (snap.data()?.count ?? 1) + 1,
        last_requested_at: new Date().toISOString(),
        status: "queued",
        fulfilled: false,
        resolve_error: "",
        ...(session
          ? {
              last_requested_by: session.uid,
              requester_uids: FieldValue.arrayUnion(session.uid),
              ...(session.email ? { requester_emails: FieldValue.arrayUnion(session.email.toLowerCase()) } : {}),
            }
          : {}),
      });
    } else {
      tx.set(ref, {
        query,
        count: 1,
        requested_at: new Date().toISOString(),
        last_requested_at: new Date().toISOString(),
        ...(session
          ? {
              requested_by: session.uid,
              requester_email: session.email,
              requester_uids: [session.uid],
              ...(session.email ? { requester_emails: [session.email.toLowerCase()] } : {}),
            }
          : {}),
        fulfilled: false,
        status: "queued",
      });
    }
  });

  try {
    await triggerStockRequestProcessing(query);
  } catch (error) {
    console.error("[stock-request] immediate trigger failed", { query, error });
  }

  return NextResponse.json({ ok: true, queued: query });
}
