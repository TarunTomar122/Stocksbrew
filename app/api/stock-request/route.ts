import { NextRequest, NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const query: string = (body.query ?? "").trim().toUpperCase();

  if (!query || query.length > 20) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
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
        ...(session ? { last_requested_by: session.uid } : {}),
      });
    } else {
      tx.set(ref, {
        query,
        count: 1,
        requested_at: new Date().toISOString(),
        last_requested_at: new Date().toISOString(),
        ...(session ? { requested_by: session.uid, requester_email: session.email } : {}),
        fulfilled: false,
      });
    }
  });

  return NextResponse.json({ ok: true });
}
