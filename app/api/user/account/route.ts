import { NextRequest, NextResponse } from "next/server";

import { adminAuth } from "@/lib/firebase-admin";
import { deleteUserAccount } from "@/lib/delete-user-account";

const SESSION_COOKIE_NAME = "tikrr_session";

export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    await deleteUserAccount(uid);
  } catch (error) {
    console.error("account_delete_failed", uid, error);
    return NextResponse.json({ error: "Could not delete account" }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
