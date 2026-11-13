import * as React from "react";


import { getSessionUser } from "@/lib/auth-server";
import { holdingsOf, MIN_HOLDINGS } from "@/lib/thesis-monitor/model";
import { getUserDoc } from "@/lib/watchlist";

import { WriteThesisButton } from "./write-thesis";

/**
 * "Write a thesis" for a signed-in person who holds at least MIN_HOLDINGS stocks; nothing for anyone else (the
 * example portfolio, a watch-only list). Streams in after the page: it never holds My stocks up.
 */
export async function ThesisEntry() {
  const session = await getSessionUser().catch(() => null);
  if (!session) return null;
  const doc = await getUserDoc(session.uid).catch(() => null);
  return holdingsOf(doc).length >= MIN_HOLDINGS ? React.createElement(WriteThesisButton) : null;
}
