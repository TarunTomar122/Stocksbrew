import { NextRequest, NextResponse } from "next/server";

import { adminFirestore } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const { email, feedback } = (await req.json()) as { email?: string; feedback?: string };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const normalized = email.toLowerCase().trim();

    const existing = await adminFirestore
      .collection("waitlist")
      .where("email", "==", normalized)
      .limit(1)
      .get();

    if (!existing.empty) {
      if (feedback?.trim()) {
        await existing.docs[0].ref.update({ feedback: feedback.trim() });
      }
      return NextResponse.json({ ok: true, message: "Already on the list" });
    }

    const data: Record<string, string> = {
      email: normalized,
      created_at: new Date().toISOString(),
      source: "landing",
    };
    if (feedback?.trim()) {
      data.feedback = feedback.trim();
    }

    await adminFirestore.collection("waitlist").add(data);

    return NextResponse.json({ ok: true, message: "You're on the list" });
  } catch (err) {
    console.error("Waitlist signup error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
