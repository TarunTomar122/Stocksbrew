import { NextResponse } from "next/server";

import { loadAccountData, toIso } from "@/app/(app)/profile/account-data";
import { publicAppUrl } from "@/lib/agent-access-config";
import { listJobs, listRuns } from "@/lib/agent-jobs-data";
import { getSessionUser } from "@/lib/auth-server";
import { getPracticePayload } from "@/lib/practice-store";
import { listStockAlerts } from "@/lib/stock-alerts";
import { getUserDoc } from "@/lib/watchlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Download my data": one JSON file with what the account holds, for the
 * signed-in person only. Read-only. Parts that fail to load are listed under
 * `could_not_read` instead of being silently left out.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const failed: string[] = [];
  async function part<T>(name: string, load: () => Promise<T>): Promise<T | null> {
    try {
      return await load();
    } catch {
      failed.push(name);
      return null;
    }
  }

  const [account, user, alerts, agents, agentRuns, practice] = await Promise.all([
    part("account", () => loadAccountData(session, `${publicAppUrl()}/api/mcp`)),
    part("portfolio", () => getUserDoc(session.uid)),
    part("alerts", () => listStockAlerts(session.uid, { limit: 100 })),
    part("agents", () => listJobs(session.uid)),
    part("agent_runs", () => listRuns(session.uid)),
    part("practice_account", async () => {
      const payload = await getPracticePayload(session.uid);
      // An account that was never opened has nothing to export.
      return payload?.opened ? payload.view : null;
    }),
  ]);

  const raw = (user ?? {}) as Record<string, unknown>;
  const body = {
    exported_at: new Date().toISOString(),
    about: "Your stocksbrew account data. Alerts are the active ones, up to 100. Agent runs are the most recent ones. Not included yet: Ask conversations, briefing item state, feedback messages and analytics events. Email us for those.",
    could_not_read: failed,
    profile: account
      ? { name: account.name, email: account.email, joined_at: account.joinedAt, last_sign_in_at: toIso(raw.last_sign_in_at), heard_about_us: raw.heard_about_us ?? null }
      : null,
    plan: account?.plan ?? null,
    email_settings: account?.emails ?? null,
    portfolio: user
      ? {
          tracked_stocks: raw.tracked_stocks ?? [],
          positions: raw.watchlist_positions ?? {},
          holdings: raw.watchlist_holdings ?? {},
          updated_at: toIso(raw.watchlist_updated_at),
        }
      : null,
    following: account?.following ?? null,
    alerts,
    agents,
    agent_runs: agentRuns,
    practice_account: practice,
    developer_tokens: account
      ? account.developer.tokens.map((token) => ({
          name: token.label,
          prefix: token.prefix,
          created_at: token.created_at,
          last_used_at: token.last_used_at,
          revoked_at: token.revoked_at,
          calls_total: token.calls_total,
        }))
      : null,
    connected_agents: account?.developer.connected ?? null,
  };

  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="stocksbrew-account-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
