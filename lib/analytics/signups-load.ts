import { parseMs } from "@/lib/analytics/funnel";
import { buildSignups, type AccountDoc, type AgentOwner, type AuthAccount, type SignupsView } from "@/lib/analytics/signups";

/**
 * Loading the Signups tab: every Firebase Auth account (1,000 a page), the `users` docs (only the fields the tab
 * shows), and who owns which agent jobs and baskets. Read only: nothing here writes. Each instance keeps the
 * answer for 60 seconds, so reloading the tab is one read a minute at most. Only the admin page calls it; the
 * list never leaves the server except inside that page's HTML, which is sent `private, no-store`.
 */

const CACHE_MS = 60 * 1000;
const AUTH_PAGE = 1000;
/** A stop for a runaway page token: 200 pages is 200,000 accounts. */
const MAX_AUTH_PAGES = 200;

export const USER_FIELDS = [
  "email",
  "display_name",
  "photo_url",
  "created_at",
  "last_sign_in_at",
  "tracked_stocks",
  "is_subscribed",
  "subscriptionStatus",
  "subscriptionId",
  "cancelAtPeriodEnd",
  "proGifted",
  "proGiftExpiresAt",
  "heard_about_us",
  "heard_about_us_other",
  "briefing_visits.last_at",
] as const;

export type AuthPage = { users: AuthAccount[]; pageToken?: string };

export type SignupsSource = {
  listAuthPage(pageToken: string | undefined): Promise<AuthPage>;
  readDocs(): Promise<AccountDoc[]>;
  readAgents(): Promise<AgentOwner[]>;
};

type UserRecordLike = {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  providerData?: Array<{ providerId?: string }>;
  metadata?: { creationTime?: string; lastSignInTime?: string; lastRefreshTime?: string | null };
};

export function authAccountOf(user: UserRecordLike): AuthAccount {
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    providers: (user.providerData ?? []).map((p) => p.providerId).filter((id): id is string => typeof id === "string"),
    createdMs: parseMs(user.metadata?.creationTime),
    lastSignInMs: parseMs(user.metadata?.lastSignInTime),
    lastRefreshMs: parseMs(user.metadata?.lastRefreshTime),
  };
}

/** Every Auth account, page by page. Stops on a repeated or missing token, or after MAX_AUTH_PAGES. */
export async function listAllAuth(listPage: SignupsSource["listAuthPage"], maxPages = MAX_AUTH_PAGES): Promise<AuthAccount[]> {
  const out: AuthAccount[] = [];
  const seen = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await listPage(token);
    out.push(...result.users);
    if (!result.pageToken || seen.has(result.pageToken)) break;
    seen.add(result.pageToken);
    token = result.pageToken;
  }
  return out;
}

const realSource: SignupsSource = {
  async listAuthPage(pageToken) {
    const { adminAuth } = await import("@/lib/firebase-admin");
    const result = await adminAuth.listUsers(AUTH_PAGE, pageToken);
    return { users: result.users.map(authAccountOf), pageToken: result.pageToken };
  },
  async readDocs() {
    const { adminFirestore } = await import("@/lib/firebase-admin");
    const snap = await adminFirestore.collection("users").select(...USER_FIELDS).get();
    return snap.docs.map((doc) => ({ uid: doc.id, data: (doc.data() ?? {}) as Record<string, unknown> }));
  },
  async readAgents() {
    const { adminFirestore } = await import("@/lib/firebase-admin");
    const [jobs, baskets] = await Promise.all([
      adminFirestore.collection("tm_agent_jobs").select("uid", "enabled", "archived").get(),
      adminFirestore.collection("tm_agent_baskets").select("uid", "enabled", "archived").get(),
    ]);
    // Job and basket ids are "<uid>__<id>" (lib/agent-jobs-data.ts, lib/basket-agent/model.ts basketDocId).
    return [...jobs.docs, ...baskets.docs].map((doc) => {
      const data = (doc.data() ?? {}) as { uid?: unknown; enabled?: unknown; archived?: unknown };
      return { uid: typeof data.uid === "string" && data.uid ? data.uid : doc.id.split("__")[0]!, on: data.enabled === true && data.archived !== true };
    });
  },
};

let source: SignupsSource = realSource;

/** Tests only: swap the reads for fakes; call with no argument to restore the real ones. */
export function setSignupsSourceForTests(fake?: SignupsSource) {
  source = fake ?? realSource;
  resetSignupsCacheForTests();
}

const globalKey = "__sbAnalyticsSignups" as const;
type GlobalWithCache = typeof globalThis & { [globalKey]?: { at: number; value: Promise<SignupsView> } };

export function resetSignupsCacheForTests() {
  delete (globalThis as GlobalWithCache)[globalKey];
}

async function compute(now: number): Promise<SignupsView> {
  // The docs are required; Auth and the agents only fill in columns, so either may fail and leave them blank.
  const [auth, docs, agents] = await Promise.all([
    listAllAuth(source.listAuthPage).catch((error) => {
      console.warn("[analytics] signups: could not list Auth accounts:", (error as Error)?.message);
      return null;
    }),
    source.readDocs(),
    source.readAgents().catch((error) => {
      console.warn("[analytics] signups: could not read agents:", (error as Error)?.message);
      return null;
    }),
  ]);
  return buildSignups({ auth, docs, agents, now });
}

/** The tab's data, kept 60 seconds per instance. A failed load is not kept. */
export function loadSignups(now = Date.now()): Promise<SignupsView> {
  const g = globalThis as GlobalWithCache;
  const hit = g[globalKey];
  if (hit && now - hit.at < CACHE_MS && now >= hit.at) return hit.value;
  const value = compute(now);
  g[globalKey] = { at: now, value };
  value.catch(() => {
    if (g[globalKey]?.value === value) delete g[globalKey];
  });
  return value;
}
