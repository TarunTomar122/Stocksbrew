import { getSessionUser } from "@/lib/auth-server";
import { etToday } from "@/lib/day-words";
import { loadThesisStrip } from "@/lib/thesis-monitor/strip-server";

import { ThesisStrip } from "./thesis-strip";

/**
 * The thesis strip for the signed-in person (My stocks, the first look): nothing signed out, nothing without a checked
 * thesis or measurable reason, nothing when the read is slow (lib/thesis-monitor/strip-server.ts, bounded).
 */
export async function ThesisStripSlot({ uid, className = "" }: { uid?: string | null; className?: string }) {
  const id = uid ?? (await getSessionUser().catch(() => null))?.uid ?? null;
  if (!id) return null;
  const today = etToday();
  const strip = await loadThesisStrip(id, { today });
  return strip ? <ThesisStrip strip={strip} today={today} className={className} /> : null;
}
