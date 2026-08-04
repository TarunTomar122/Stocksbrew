const BOT_USER_AGENT_RE =
  /bot\b|spider|crawler|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|twitterbot|linkedinbot|discordbot|whatsapp/i;

export const ANONYMOUS_STOCK_DEMAND_DAILY_LIMIT = 8;
export const SIGNED_IN_STOCK_DEMAND_DAILY_LIMIT = 30;
export const ON_DEMAND_INTEL_TTL_MS = 24 * 60 * 60 * 1000;

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isOnDemandIntelFresh(
  row: Record<string, unknown> | null,
  nowMs = Date.now(),
  staleAfterMs = ON_DEMAND_INTEL_TTL_MS,
): boolean {
  if (!row) return false;
  const text = String(
    row.today_brief || row.body || row.headline || row.thesis || "",
  ).trim();
  if (!text) return false;
  const generatedAt =
    parseTimestamp(row.generated_at) ??
    parseTimestamp(row.updated_at) ??
    parseTimestamp(row.captured_at);
  return generatedAt !== null && nowMs - generatedAt >= 0 && nowMs - generatedAt < staleAfterMs;
}

export function isLikelyHumanStockDemand(input: {
  origin?: string | null;
  host?: string | null;
  secFetchSite?: string | null;
  userAgent?: string | null;
}): boolean {
  const fetchSite = String(input.secFetchSite || "").trim().toLowerCase();
  if (fetchSite === "cross-site") return false;

  const userAgent = String(input.userAgent || "").trim();
  if (!userAgent || BOT_USER_AGENT_RE.test(userAgent)) return false;

  const origin = String(input.origin || "").trim();
  const host = String(input.host || "").trim().toLowerCase();
  if (!origin || !host) return true;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

export function stockDemandDailyLimit(signedIn: boolean): number {
  return signedIn
    ? SIGNED_IN_STOCK_DEMAND_DAILY_LIMIT
    : ANONYMOUS_STOCK_DEMAND_DAILY_LIMIT;
}
