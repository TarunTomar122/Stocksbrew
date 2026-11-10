import { cache } from "react";

import { cookies } from "next/headers";

import { adminAuth } from "@/lib/firebase-admin";

const SESSION_COOKIE_NAME = "tikrr_session";

const SESSION_TRUST_MS = 60_000;
const recentSessions = new Map<string, { user: SessionUser; at: number }>();

export type SessionUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;
  // Checking a session with Firebase (including whether it was revoked) is a
  // network round trip on every signed-in request. A session that checked
  // out a moment ago is trusted for a short while, so a revoked session
  // stops working within SESSION_TRUST_MS instead of instantly.
  const trusted = recentSessions.get(sessionCookie);
  if (trusted && Date.now() - trusted.at < SESSION_TRUST_MS) return trusted.user;
  // The revocation check is a network call. When it fails for a reason that is
  // not about the cookie (a timeout, a dropped connection), try once more
  // before treating a signed-in person as signed out. A cookie that is
  // expired, revoked or malformed is refused straight away.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
      const user: SessionUser = {
        uid: decoded.uid,
        email: decoded.email ?? null,
        displayName: (decoded.name as string | undefined) ?? null,
        photoURL: (decoded.picture as string | undefined) ?? null,
      };
      if (recentSessions.size >= 500) recentSessions.clear();
      recentSessions.set(sessionCookie, { user, at: Date.now() });
      return user;
    } catch (error) {
      const code = String((error as { code?: unknown } | null)?.code ?? "");
      if (code.startsWith("auth/") && !/network|internal|unavailable|timeout/i.test(code)) return null;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  return null;
});

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("unauthenticated");
  }
  return user;
}
