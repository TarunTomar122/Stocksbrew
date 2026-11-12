import { NextResponse, type NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { viewerFromUserDoc } from "@/lib/entitlements-server";
import { clearableBy, forClient, popoverItems } from "@/lib/inbox/merge";
import { loadExampleInbox, loadUserInbox, readState } from "@/lib/inbox/server";
import type { InboxSummary } from "@/lib/inbox/types";
import { getUserDoc } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

/**
 * The bell's data: the unread count and the newest few items. The bell asks
 * for it after the page has painted, so no page waits on it. Always private
 * (it can be a person's own inbox). The bell names the account it asks for
 * (`?u=<uid>` or `?u=anon`); only when that matches the session may the
 * browser keep the answer for a few seconds, so a cached inbox is never shown
 * to another account in the same browser. The merged inbox behind it is reused
 * on the server for a minute per person.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionUser().catch(() => null);
  const asked = request.nextUrl.searchParams.get("u") ?? "";
  const cacheFor = (seconds: number) => (asked === (session?.uid ?? "anon") ? `private, max-age=${seconds}` : "private, no-store");
  if (!session) {
    const inbox = await loadExampleInbox();
    const items = popoverItems(inbox.items, inbox.today);
    const body: InboxSummary = { signedIn: false, example: true, unread: 0, seenAt: null, items: items.map(forClient), clearable: false, complete: inbox.missing.length === 0 };
    return NextResponse.json(body, { headers: { "Cache-Control": cacheFor(300) } });
  }
  try {
    const doc = await getUserDoc(session.uid);
    const viewer = viewerFromUserDoc(session.uid, doc);
    const inbox = await loadUserInbox(viewer, doc);
    const { seenAt, unread } = readState(inbox.items, doc, inbox.today);
    // The popover's rows, as the page draws them; its count is rows too, so one agent run is not "9+".
    const items = popoverItems(inbox.items, inbox.today);
    const body: InboxSummary = {
      signedIn: true,
      example: false,
      unread,
      seenAt,
      items: items.map(forClient),
      clearable: clearableBy(inbox.items, items, seenAt),
      complete: inbox.missing.length === 0,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": cacheFor(30) } });
  } catch (error) {
    console.warn("[inbox] summary failed:", error instanceof Error ? error.message : error);
    // No count rather than a wrong one; the bell stays quiet.
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
