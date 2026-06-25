import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { isAttributionSourceId } from "@/lib/attribution";
import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.skipped === true) {
    await adminFirestore.collection("users").doc(session.uid).set(
      {
        attribution_skipped: true,
        attribution_skipped_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true, skipped: true });
  }

  const source = String(body.source ?? "").trim().toLowerCase();
  if (!isAttributionSourceId(source)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }

  const other =
    source === "other" ? String(body.other ?? "").trim().slice(0, 120) : "";

  if (source === "other" && !other) {
    return NextResponse.json({ error: "Please tell us a bit more" }, { status: 400 });
  }

  await adminFirestore.collection("users").doc(session.uid).set(
    {
      heard_about_us: source,
      ...(source === "other" ? { heard_about_us_other: other } : {}),
      heard_about_us_at: FieldValue.serverTimestamp(),
      attribution_skipped: false,
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true, source, other: other || undefined });
}
