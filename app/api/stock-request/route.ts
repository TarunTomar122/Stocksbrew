import { NextRequest, NextResponse } from "next/server";
import { adminFirestore } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth-server";
import { FieldValue } from "firebase-admin/firestore";
import { getApp } from "firebase-admin/app";

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

async function triggerStockRequestProcessing(query: string): Promise<void> {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const region = process.env.GOOGLE_CLOUD_REGION?.trim() || "us-central1";
  const dispatchJob = process.env.DISPATCH_JOB_NAME?.trim() || "tikrr-dispatch";
  if (!project) {
    throw new Error("GOOGLE_CLOUD_PROJECT missing");
  }

  const app = getApp();
  const credential = app.options.credential as { getAccessToken?: () => Promise<{ access_token?: string }> };
  if (!credential?.getAccessToken) {
    throw new Error("Firebase admin credential cannot mint access token");
  }
  const tokenResp = await credential.getAccessToken();
  const token = tokenResp?.access_token;
  if (!token) {
    throw new Error("Google access token unavailable");
  }

  const url = `https://run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/${dispatchJob}:run`;
  const body = {
    overrides: {
      containerOverrides: [
        {
          args: [
            "-m",
            "backend.cloudrun.orchestrator.dispatch",
            "--lane",
            "stock_requests",
            "--market",
            "US",
            "--project",
            project,
            "--region",
            region,
            "--limit",
            "1",
            "--query",
            query,
          ],
        },
      ],
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`dispatch jobs.run failed (${resp.status}): ${text.slice(0, 400)}`);
  }
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
