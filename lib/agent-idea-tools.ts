import { AGENT_ACCESS_VERSION, AGENT_DATA_NOTICE, publicAppUrl } from "@/lib/agent-access-config";
import { AgentDataError } from "@/lib/agent-errors";
import { BASKET_ID_RE, cleanTicker } from "@/lib/basket-agent/model";
import { loadBasketDetail, loadBasketSummaries } from "@/lib/basket-agent/read";
import { etToday } from "@/lib/day-words";
import type { FilingRef } from "@/lib/filing-changes/diff";
import { filingChangesHref } from "@/lib/filing-changes/inbox";
import { comparisonSentence, filingName, newerLine, readFilingChangesOf } from "@/lib/filing-changes/read";
import { getFilingChanges } from "@/lib/filing-changes/server";
import { freshnessInfo } from "@/lib/freshness";
import { resolveInstrumentByTicker } from "@/lib/instrument-resolver";

/**
 * Agent tools (MCP, REST, CLI) over what a company changed in its risk factors (lib/filing-changes) and the member's
 * idea baskets (lib/basket-agent). Thin wrappers over the readers Ask uses (lib/filing-changes/read.ts,
 * lib/basket-agent/read.ts), so an agent gets the same comparison, verdicts and sentences the app shows, with sources,
 * dates and a link. Nothing here computes a figure.
 *
 * Reads only. Creating a basket, switching one on or accepting a proposed change stays in the app: whether an outside
 * agent may do those is a separate decision. Scope checks and the daily allowance run in executeAgentTool first;
 * agent access itself is Pro only (requireAgentPrincipal), so the baskets are read with the Pro plan's limits.
 */

const FRESHNESS = {
  /** A company files a 10-Q or 10-K about every three months. */
  filings: { agingHours: 100 * 24, staleHours: 200 * 24 },
  /** Baskets are checked after every close. */
  daily: { agingHours: 36, staleHours: 84 },
} as const;

function envelope<T extends Record<string, unknown>>(data: T, asOf: string | null, thresholds: { agingHours: number; staleHours: number }) {
  const freshness = freshnessInfo(asOf, thresholds);
  return {
    schema_version: AGENT_ACCESS_VERSION,
    as_of: asOf,
    freshness: {
      status: freshness.status,
      age_hours: freshness.ageHours === null ? null : Math.round(freshness.ageHours * 10) / 10,
      relative: freshness.relative || null,
    },
    notice: AGENT_DATA_NOTICE,
    ...data,
  };
}

function link(path: string): string {
  return `${publicAppUrl()}${path}`;
}

function filingOut(ref: FilingRef) {
  return { form: ref.form, filed: ref.filed, period: ref.period, url: ref.url };
}

/* ── get_filing_changes ───────────────────────────────────────────────── */

export async function getAgentFilingChanges(input: { ticker: string }) {
  const raw = input.ticker.trim();
  if (!raw || raw.length > 20) throw new AgentDataError("A ticker is required, at most 20 characters.", "invalid_ticker");
  const ticker = cleanTicker(raw);
  if (!ticker) throw new AgentDataError("No US stock with that ticker is in our catalog.", "stock_not_found", 404);
  const today = etToday();
  const read = readFilingChangesOf(await getFilingChanges(ticker), today);
  if (read.kind === "none") {
    const known = await resolveInstrumentByTicker(ticker, "US").catch(() => undefined);
    if (known === null) throw new AgentDataError("No US stock with that ticker is in our catalog.", "stock_not_found", 404);
    return envelope(
      {
        data_status: "no_comparison",
        ticker,
        message: `We haven't compared ${ticker}'s 10-K and 10-Q risk factors yet. Say so; do not guess what it added or dropped.`,
        link: link(`/stock/${encodeURIComponent(ticker)}`),
      },
      null,
      FRESHNESS.filings,
    );
  }
  if (read.kind === "unreadable") {
    return envelope(
      {
        data_status: "unreadable",
        ticker: read.ticker,
        company: read.company,
        filing: filingOut(read.filing),
        message: `We couldn't read the risk section of ${read.ticker}'s ${filingName(read.filing, today)}, so there is no comparison. Do not guess what changed.`,
        link: link(`/stock/${encodeURIComponent(read.ticker)}`),
      },
      read.filing.filed,
      FRESHNESS.filings,
    );
  }
  const { shown, newer, unread } = read;
  const asOf = [shown.filing.filed, newer?.filing.filed, unread?.filed].filter((day): day is string => Boolean(day)).sort().pop() ?? null;
  return envelope(
    {
      data_status: "available",
      ticker: read.ticker,
      company: read.company,
      summary: comparisonSentence(read.ticker, shown, today),
      status: shown.status,
      scope: shown.scope,
      scope_note:
        shown.scope === "partial"
          ? "This 10-Q lists only some risks. They are held against the latest 10-K, so nothing can be called dropped."
          : null,
      filing: filingOut(shown.filing),
      compared_with: shown.base ? filingOut(shown.base) : null,
      added: shown.added,
      repeated: shown.repeated ?? [],
      dropped: shown.dropped,
      reworded: shown.reworded.map((pair) => ({ from: pair.from, to: pair.to })),
      unchanged: shown.same,
      since: newer ? { filing: filingOut(newer.filing), line: newerLine(newer, today) } : null,
      unread: unread ? { filing: filingOut(unread), line: `We couldn't read the risk section of its ${filingName(unread, today)}.` } : null,
      method: "Every risk is the company's own heading, copied from the filing. Headings are matched by plain rules; no model reads or rewords them.",
      source: { name: "SEC EDGAR", as_of: asOf },
      link: link(read.onPage ? filingChangesHref(read.ticker) : `/stock/${encodeURIComponent(read.ticker)}`),
    },
    asOf,
    FRESHNESS.filings,
  );
}

/* ── list_baskets / get_basket ────────────────────────────────────────── */

const HOW_TO_CHANGE = "Read only. The member creates, edits and switches baskets on in the app, and answers proposed changes in Needs you.";

export async function listAgentBaskets(uid: string) {
  const baskets = await loadBasketSummaries(uid, "pro").catch((error) => {
    console.error("agent_baskets_read_failed", error instanceof Error ? error.message : "unknown");
    throw new AgentDataError("Your idea baskets could not be read just now. Try again in a minute.", "baskets_unavailable", 503);
  });
  const asOf = baskets.map((basket) => basket.latest?.day).filter((day): day is string => Boolean(day)).sort().pop() ?? null;
  return envelope(
    {
      data_status: baskets.length > 0 ? "available" : "no_baskets",
      message: baskets.length > 0 ? null : "The member has no idea baskets yet.",
      count: baskets.length,
      baskets: baskets.map(({ href, ...basket }) => ({ ...basket, link: link(href) })),
      how_to_change: HOW_TO_CHANGE,
      link: link("/agents/jobs"),
    },
    asOf,
    FRESHNESS.daily,
  );
}

export async function getAgentBasket(uid: string, input: { basket_id: string }) {
  const id = input.basket_id.trim().toLowerCase();
  if (!id) throw new AgentDataError("A basket_id is required. list_baskets gives each basket's id.", "invalid_basket_id");
  // Someone else's id and an id that never existed read the same.
  const notFound = () => new AgentDataError("No idea basket with that id belongs to this account.", "basket_not_found", 404);
  if (!BASKET_ID_RE.test(id)) throw notFound();
  const basket = await loadBasketDetail(uid, id, "pro").catch((error) => {
    console.error("agent_basket_read_failed", error instanceof Error ? error.message : "unknown");
    throw new AgentDataError("That idea basket could not be read just now. Try again in a minute.", "baskets_unavailable", 503);
  });
  if (!basket) throw notFound();
  const { href, ...rest } = basket;
  return envelope(
    {
      data_status: "available",
      basket: rest,
      how_to_change: HOW_TO_CHANGE,
      link: link(href),
    },
    basket.latest?.day ?? null,
    FRESHNESS.daily,
  );
}
