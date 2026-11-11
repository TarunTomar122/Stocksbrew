import { cache } from "react";

import { cookies } from "next/headers";

import { afterResponse } from "@/lib/after-response";
import { adminAuth } from "@/lib/firebase-admin";

const SESSION_COOKIE_NAME = "tikrr_session";

/** A session that checked out this recently is trusted without asking Firebase again. */
const SESSION_TRUST_MS = 60_000;
/**
 * Past that, and up to this age, the request goes ahead on the earlier check
 * while Firebase is asked again after the response; a revoked or disabled
 * session is dropped as soon as that answer is in. Older than this, the check
 * runs before the page, as on first sight.
 */
const SESSION_STALE_MS = 10 * 60_000;

export type SessionUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

/** What one check with Firebase said. "refused": expired, revoked or malformed. "unavailable": could not ask. */
export type SessionCheck = { user: SessionUser; expiresAt: number } | "refused" | "unavailable";

type Trusted = { user: SessionUser; at: number; expiresAt: number; checking: boolean };

/**
 * Remembers recent session checks for one server instance, keyed by the
 * session cookie itself (so a cookie only ever resolves to the uid Firebase
 * gave for that cookie). Never trusts a session past its own expiry.
 */
export function createSessionTrust(options: {
  verify: (cookie: string) => Promise<SessionCheck>;
  background?: (label: string, work: Promise<unknown>) => void;
  now?: () => number;
  trustMs?: number;
  staleMs?: number;
  max?: number;
}) {
  const now = options.now ?? Date.now;
  const trustMs = options.trustMs ?? SESSION_TRUST_MS;
  const staleMs = options.staleMs ?? SESSION_STALE_MS;
  const max = options.max ?? 500;
  const background = options.background ?? afterResponse;
  const trusted = new Map<string, Trusted>();

  const remember = (cookie: string, check: SessionCheck): SessionUser | null => {
    if (check === "refused") {
      trusted.delete(cookie);
      return null;
    }
    if (check === "unavailable") return null;
    if (trusted.size >= max && !trusted.has(cookie)) trusted.clear();
    trusted.set(cookie, { user: check.user, at: now(), expiresAt: check.expiresAt, checking: false });
    return check.user;
  };

  return {
    async resolve(cookie: string): Promise<SessionUser | null> {
      const entry = trusted.get(cookie);
      const at = now();
      if (entry && at < entry.expiresAt) {
        const age = at - entry.at;
        if (age < trustMs) return entry.user;
        if (age < staleMs) {
          if (!entry.checking) {
            entry.checking = true;
            background(
              "session re-check",
              options.verify(cookie).then(
                (check) => {
                  // A failed attempt to ask leaves the entry as it was, so the next request asks again.
                  if (check === "unavailable") entry.checking = false;
                  else remember(cookie, check);
                },
                () => {
                  entry.checking = false;
                },
              ),
            );
          }
          return entry.user;
        }
      }
      if (entry) trusted.delete(cookie);
      return remember(cookie, await options.verify(cookie));
    },
    /** Drop every remembered session of one person (their account was just deleted on this instance). */
    forgetUid(uid: string): void {
      for (const [cookie, entry] of trusted) if (entry.user.uid === uid) trusted.delete(cookie);
    },
    /** For tests. */
    size: () => trusted.size,
  };
}

/**
 * One check with Firebase, including whether the session was revoked (a
 * network round trip). A failure that is not about the cookie (a timeout, a
 * dropped connection) is tried once more before giving up; a cookie that is
 * expired, revoked or malformed is refused straight away.
 */
async function verifyWithFirebase(cookie: string): Promise<SessionCheck> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const decoded = await adminAuth.verifySessionCookie(cookie, true);
      const expSeconds = typeof decoded.exp === "number" ? decoded.exp : Number.NaN;
      return {
        user: {
          uid: decoded.uid,
          email: decoded.email ?? null,
          displayName: (decoded.name as string | undefined) ?? null,
          photoURL: (decoded.picture as string | undefined) ?? null,
        },
        // Without an expiry claim, trust only as long as a fresh check would be trusted.
        expiresAt: Number.isFinite(expSeconds) ? expSeconds * 1000 : Date.now() + SESSION_TRUST_MS,
      };
    } catch (error) {
      const code = String((error as { code?: unknown } | null)?.code ?? "");
      if (code.startsWith("auth/") && !/network|internal|unavailable|timeout/i.test(code)) return "refused";
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  return "unavailable";
}

const sessionTrust = createSessionTrust({ verify: verifyWithFirebase });

/**
 * The signed-in person, or null. Checking a session with Firebase is a network
 * round trip, so a check is reused: for a minute outright, then for up to ten
 * minutes while Firebase is asked again in the background (createSessionTrust).
 * So a revoked or deleted session keeps working for up to a minute after its
 * last check, and then for the one request (or burst of requests) that starts
 * the background re-check, if that comes within ten minutes; after that it is
 * refused. Before this, the window was the minute alone.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const sessionCookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;
  return sessionTrust.resolve(sessionCookie);
});

/** Forget one person's remembered sessions on this server instance, so their next request is checked with Firebase. */
export function forgetSessionsFor(uid: string): void {
  sessionTrust.forgetUid(uid);
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("unauthenticated");
  }
  return user;
}
