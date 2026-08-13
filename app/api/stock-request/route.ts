import { NextRequest, NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";
import { FieldValue } from "firebase-admin/firestore";

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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isLikelyJunkRequest(query: string): boolean {
  if (!query) return true;
  if (INVALID_REQUEST_TOKENS.has(query)) return true;
  // Block obvious URL/domain-like and noisy tokens.
  if (query.includes("/") || query.includes(":")) return true;
  if (query.endsWith(".COM") || query.endsWith(".NET") || query.endsWith(".ORG")) return true;
  return false;
}

function normalizeEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return email && email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

export async function GET(req: NextRequest) {
  const query = (new URL(req.url).searchParams.get("query") ?? "").trim().toUpperCase();
  if (!query || query.length > 20 || isLikelyJunkRequest(query)) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const snap = await adminFirestore.collection("stock_requests").doc(query).get();
  if (!snap.exists) return NextResponse.json({ query, status: "not_requested", fulfilled: false });
  const data = snap.data() ?? {};
  return NextResponse.json({
    query,
    status: data.status ?? "queued",
    fulfilled: Boolean(data.fulfilled),
    resolvedSymbol: data.resolved_symbol ?? null,
    fulfilledAt: data.fulfilled_at ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const query = String(body.query ?? "").trim().toUpperCase();
  const email = normalizeEmail(body.email);
  if (!query || query.length > 20 || isLikelyJunkRequest(query) || !email) {
    return NextResponse.json({ error: "Valid query and email are required" }, { status: 400 });
  }
  const ref = adminFirestore.collection("stock_requests").doc(query);
  if (!(await ref.get()).exists) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  await ref.set(
    { requester_emails: FieldValue.arrayUnion(email), updated_at: new Date().toISOString() },
    { merge: true },
  );
  return NextResponse.json({ ok: true, emailAttached: true, query });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const query: string = (body.query ?? "").trim().toUpperCase();
  const suppliedEmail = String(body.email ?? "").trim();
  const email = normalizeEmail(suppliedEmail);

  if (!query || query.length > 20) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  if (isLikelyJunkRequest(query)) {
    return NextResponse.json({ error: "Query does not look like a stock symbol or company name" }, { status: 400 });
  }
  if (suppliedEmail && !email) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const session = await getSessionUser();
  const requesterEmails = [session?.email, email]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

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
              ...(requesterEmails.length ? { requester_emails: FieldValue.arrayUnion(...requesterEmails) } : {}),
            }
          : {}),
      });
    } else {
      tx.set(ref, {
        query,
        count: 1,
        requested_at: new Date().toISOString(),
        last_requested_at: new Date().toISOString(),
        ...(session || requesterEmails.length
          ? {
              ...(session ? { requested_by: session.uid, requester_uids: [session.uid] } : {}),
              ...(requesterEmails.length ? { requester_emails: requesterEmails, requester_email: requesterEmails[0] } : {}),
            }
          : {}),
        fulfilled: false,
        status: "queued",
      });
    }
  });

  return NextResponse.json({ ok: true, queued: query, emailAttached: Boolean(session?.email || email) });
}
