import {
  AGENT_DAILY_CALL_LIMIT,
  AGENT_MAX_ACTIVE_TOKENS,
  AGENT_OAUTH_CLIENT_COLLECTION,
  AGENT_TOKEN_COLLECTION,
} from "@/lib/agent-access-config";
import { listPersonalAgentTokens } from "@/lib/agent-auth";
import { listJobs } from "@/lib/agent-jobs-data";
import { getAgentUsage } from "@/lib/agent-quota";
import type { SessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { getFollowSources, normalizeFollowed } from "@/lib/follow";
import { normalizeFollowedIds } from "@/lib/markets-shared";
import { readSavedScreens, type SavedScreen } from "@/lib/screener-saved";
import { listStrategies, readTrackedStrategies } from "@/lib/strategies";
import { getUserDoc, resolveIsSubscribed, type UserDoc } from "@/lib/watchlist";

/**
 * Everything the Account page shows, loaded once on the server and passed
 * down as plain JSON. Nothing here writes. Each optional part fails soft:
 * a section whose data could not be read says so instead of breaking the page.
 */

export type TokenSummary = {
  id: string;
  label: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  calls_total: number;
};

export type ConnectedAgent = {
  clientId: string;
  name: string;
  connectedAt: string | null;
  lastUsedAt: string | null;
  /** When the current refresh token stops working if it is never used. */
  expiresAt: string | null;
};

export type AccountData = {
  /** True when this is sample data shown in development without a session. */
  preview: boolean;
  name: string | null;
  email: string | null;
  joinedAt: string | null;
  plan: {
    isPro: boolean;
    /** "gift" is Pro granted by us, with no subscription behind it. */
    kind: "free" | "pro" | "gift";
    billing: "monthly" | "yearly" | null;
    status: string | null;
    /** A subscription exists at the payment provider, so there is something to cancel. */
    billable: boolean;
    cancelAtPeriodEnd: boolean;
    subscribedAt: string | null;
    lastPaymentAt: string | null;
    lastPaymentFailedAt: string | null;
    cancelledAt: string | null;
    giftExpiresAt: string | null;
  };
  portfolio: { holdings: number; watching: number };
  emails: { alerts: boolean; digest: boolean; weekly: boolean; product: boolean };
  developer: {
    tokens: TokenSummary[];
    maxActiveTokens: number;
    usage: { used: number; limit: number };
    /** Null when the list could not be read. */
    connected: ConnectedAgent[] | null;
    mcpUrl: string;
  };
  /** Standing jobs. Null when they could not be read. */
  agents: { total: number; enabled: number } | null;
  following: {
    sources: { slug: string; name: string | null }[];
    strategies: { slug: string; name: string | null }[];
    markets: string[];
    screens: SavedScreen[];
  };
};

/** Timestamps arrive as ISO strings, Firestore Timestamps or plain {seconds} objects depending on the store. */
export function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return Number.isNaN(Date.parse(value)) ? null : new Date(value).toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const record = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof record.toDate === "function") return record.toDate().toISOString();
    const seconds = record.seconds ?? record._seconds;
    if (typeof seconds === "number") return new Date(seconds * 1000).toISOString();
  }
  return null;
}

type RawUser = UserDoc & {
  lastPaymentAt?: unknown;
  followedSources?: unknown;
  tracked_strategies?: unknown;
  followed_market_assets?: unknown;
  saved_screens?: unknown;
  email_weekly_enabled?: boolean;
  email_product_enabled?: boolean;
};

export function planOf(user: RawUser | null): AccountData["plan"] {
  const isPro = resolveIsSubscribed(user);
  const subscriptionId = typeof user?.subscriptionId === "string" ? user.subscriptionId.trim() : "";
  const gift = Boolean(user?.proGifted) && isPro;
  const billing = user?.subscriptionPlan === "yearly" ? "yearly" : user?.subscriptionPlan === "monthly" ? "monthly" : null;
  return {
    isPro,
    kind: !isPro ? "free" : gift ? "gift" : "pro",
    billing: isPro && !gift ? billing : null,
    status: user?.subscriptionStatus ?? null,
    billable: subscriptionId.length > 0,
    cancelAtPeriodEnd: Boolean(user?.cancelAtPeriodEnd),
    subscribedAt: toIso(user?.subscribedAt),
    lastPaymentAt: toIso(user?.lastPaymentAt),
    lastPaymentFailedAt: toIso(user?.lastPaymentFailedAt),
    cancelledAt: toIso(user?.cancelledAt),
    giftExpiresAt: gift ? toIso(user?.proGiftExpiresAt) : null,
  };
}

/** Agents connected through OAuth: one row per client that still holds a live refresh token. */
async function loadConnectedAgents(uid: string): Promise<ConnectedAgent[]> {
  const snap = await adminFirestore.collection(AGENT_TOKEN_COLLECTION).where("uid", "==", uid).limit(300).get();
  const now = Date.now();
  const byClient = new Map<string, ConnectedAgent>();
  for (const doc of snap.docs) {
    const data = doc.data() as {
      kind?: string;
      client_id?: string | null;
      created_at?: string;
      expires_at?: string | null;
      last_used_at?: string | null;
      revoked_at?: string | null;
    };
    if (!data.client_id || (data.kind !== "refresh" && data.kind !== "access")) continue;
    const live = !data.revoked_at && (!data.expires_at || Date.parse(data.expires_at) > now);
    const entry = byClient.get(data.client_id) ?? { clientId: data.client_id, name: data.client_id, connectedAt: null, lastUsedAt: null, expiresAt: null };
    if (data.created_at && (!entry.connectedAt || data.created_at < entry.connectedAt)) entry.connectedAt = data.created_at;
    if (data.last_used_at && (!entry.lastUsedAt || data.last_used_at > entry.lastUsedAt)) entry.lastUsedAt = data.last_used_at;
    if (data.kind === "refresh" && live && data.expires_at && (!entry.expiresAt || data.expires_at > entry.expiresAt)) entry.expiresAt = data.expires_at;
    byClient.set(data.client_id, entry);
  }
  // Only clients that can still get a new access token count as connected.
  const connected = [...byClient.values()].filter((entry) => entry.expiresAt != null);
  await Promise.all(
    connected.map(async (entry) => {
      const client = await adminFirestore.collection(AGENT_OAUTH_CLIENT_COLLECTION).doc(entry.clientId).get().catch(() => null);
      const name = client?.exists ? (client.data() as { client_name?: unknown }).client_name : null;
      if (typeof name === "string" && name.trim()) entry.name = name.trim();
    }),
  );
  return connected.sort((a, b) => (b.lastUsedAt ?? b.connectedAt ?? "").localeCompare(a.lastUsedAt ?? a.connectedAt ?? ""));
}

export async function loadAccountData(session: SessionUser, mcpUrl: string): Promise<AccountData> {
  const user = (await getUserDoc(session.uid).catch(() => null)) as RawUser | null;
  const plan = planOf(user);

  const positions = user?.watchlist_positions ?? {};
  const tracked = Array.isArray(user?.tracked_stocks) ? user.tracked_stocks : [];
  const holdings = tracked.filter((id) => positions[id] === "holding").length;

  const followedSlugs = normalizeFollowed(user?.followedSources);
  const trackedStrategies = readTrackedStrategies(user);

  const [tokens, usage, connected, jobs, sources, strategies] = await Promise.all([
    plan.isPro ? listPersonalAgentTokens(session.uid).catch(() => [] as TokenSummary[]) : Promise.resolve([] as TokenSummary[]),
    plan.isPro
      ? getAgentUsage(session.uid).catch(() => ({ used: 0, limit: AGENT_DAILY_CALL_LIMIT }))
      : Promise.resolve({ used: 0, limit: AGENT_DAILY_CALL_LIMIT }),
    loadConnectedAgents(session.uid).catch(() => null),
    listJobs(session.uid).catch(() => null),
    followedSlugs.length > 0 ? getFollowSources().catch(() => []) : Promise.resolve([]),
    trackedStrategies.length > 0 ? listStrategies().catch(() => []) : Promise.resolve([]),
  ]);

  const sourceNames = new Map((sources as { slug: string; name: string }[]).map((source) => [source.slug, source.name]));
  const strategyNames = new Map((strategies as { slug: string; name: string }[]).map((strategy) => [strategy.slug, strategy.name]));

  return {
    preview: false,
    name: session.displayName || user?.display_name || null,
    email: session.email || user?.email || null,
    joinedAt: toIso(user?.created_at),
    plan,
    portfolio: { holdings, watching: Math.max(0, tracked.length - holdings) },
    emails: {
      alerts: user?.email_alerts_enabled ?? true,
      digest: user?.email_digest_enabled ?? true,
      // backend/mail/send.py wants(): an unset weekly switch follows the old digest opt-out
      weekly: user?.email_weekly_enabled ?? user?.email_digest_enabled ?? true,
      product: user?.email_product_enabled ?? true,
    },
    developer: {
      tokens,
      maxActiveTokens: AGENT_MAX_ACTIVE_TOKENS,
      usage: { used: usage.used, limit: usage.limit },
      connected,
      mcpUrl,
    },
    agents: jobs ? { total: jobs.filter((job) => !job.archived).length, enabled: jobs.filter((job) => !job.archived && job.enabled).length } : null,
    following: {
      sources: followedSlugs.map((slug) => ({ slug, name: sourceNames.get(slug) ?? null })),
      strategies: trackedStrategies.map((item) => ({ slug: item.slug, name: strategyNames.get(item.slug) ?? null })),
      markets: normalizeFollowedIds(user?.followed_market_assets),
      screens: readSavedScreens(user?.saved_screens),
    },
  };
}

/** Sample data for looking at the page in development without signing in. Never used in production. */
export function sampleAccountData(kind: "free" | "pro", mcpUrl: string): AccountData {
  const pro = kind === "pro";
  return {
    preview: true,
    name: "Sample Person",
    email: "sample@example.com",
    joinedAt: "2026-03-14T15:00:00.000Z",
    plan: {
      isPro: pro,
      kind: pro ? "pro" : "free",
      billing: pro ? "monthly" : null,
      status: pro ? "active" : null,
      billable: pro,
      cancelAtPeriodEnd: false,
      subscribedAt: pro ? "2026-08-02T14:10:00.000Z" : null,
      lastPaymentAt: pro ? "2026-11-02T14:10:00.000Z" : null,
      lastPaymentFailedAt: null,
      cancelledAt: null,
      giftExpiresAt: null,
    },
    portfolio: { holdings: pro ? 9 : 3, watching: pro ? 14 : 2 },
    emails: { alerts: true, digest: true, weekly: true, product: !pro },
    developer: {
      tokens: pro
        ? [
            { id: "sampletoken0001", label: "Laptop script", prefix: "sbp.sample…", created_at: "2026-10-01T09:00:00.000Z", last_used_at: "2026-11-09T13:20:00.000Z", revoked_at: null, calls_total: 412 },
            { id: "sampletoken0002", label: "Old test", prefix: "sbp.sampl2…", created_at: "2026-09-12T09:00:00.000Z", last_used_at: null, revoked_at: "2026-09-20T09:00:00.000Z", calls_total: 3 },
          ]
        : [],
      maxActiveTokens: AGENT_MAX_ACTIVE_TOKENS,
      usage: { used: pro ? 37 : 0, limit: AGENT_DAILY_CALL_LIMIT },
      connected: pro
        ? [{ clientId: "sample-client", name: "Claude Code", connectedAt: "2026-10-20T10:00:00.000Z", lastUsedAt: "2026-11-09T12:05:00.000Z", expiresAt: "2026-12-09T12:05:00.000Z" }]
        : [],
      mcpUrl,
    },
    agents: { total: pro ? 4 : 1, enabled: pro ? 3 : 1 },
    following: {
      sources: pro ? [{ slug: "berkshire-hathaway", name: "Berkshire Hathaway" }, { slug: "scion", name: "Scion Asset Management" }] : [],
      strategies: pro ? [{ slug: "momentum-12-1", name: "12-1 momentum" }] : [],
      markets: pro ? ["spy", "us10y", "btc"] : [],
      screens: pro ? [{ id: "s1", name: "Cheap and growing", query: "pe_max=18&rev_growth_min=10", created_at: "2026-11-01T10:00:00.000Z" }] : [],
    },
  };
}
