/** Types and pure helpers for SEC filings, safe to import from client components. */

export const FILING_GROUPS = ["8-K", "10-Q", "10-K", "S-1", "13D/G"] as const;
export type FilingGroup = (typeof FILING_GROUPS)[number];

export const FILING_GROUP_HINTS: Record<FilingGroup, string> = {
  "8-K": "Current report: something material happened",
  "10-Q": "Quarterly report",
  "10-K": "Annual report",
  "S-1": "Registration for a share offering",
  "13D/G": "Someone holds more than 5% of the shares",
};

export type FilingItem = { code: string; label: string };

export type Filing = {
  id: string;
  ticker: string;
  company: string;
  /** The exact SEC form, for example "8-K/A" or "SC 13G". */
  form: string;
  group: FilingGroup;
  amendment: boolean;
  /** One plain line: the lead 8-K item, or what the form is. */
  headline: string;
  items: FilingItem[];
  /** Acceptance time at the SEC, ISO UTC. */
  filedAt: string;
  url: string;
};

export type FilingsMeta = {
  updatedAt: string;
  windowDays: number | null;
  companiesChecked: number | null;
  total: number | null;
};

function isGroup(value: unknown): value is FilingGroup {
  return typeof value === "string" && (FILING_GROUPS as readonly string[]).includes(value);
}

/** A stored document to the row the app draws. Null when it lacks what a row needs. */
export function normalizeFiling(raw: Record<string, unknown>, id: string): Filing | null {
  const ticker = typeof raw.ticker === "string" ? raw.ticker.trim().toUpperCase() : "";
  const filedAt = typeof raw.filed_at === "string" ? raw.filed_at : "";
  const url = typeof raw.url === "string" ? raw.url : "";
  if (!ticker || !filedAt || !isGroup(raw.form_group)) return null;
  // A company's EDGAR record also lists stakes it reported in other companies. Those are not about it.
  if (raw.form_group === "13D/G" && raw.role !== "subject") return null;
  if (!/^https:\/\/www\.sec\.gov\//.test(url) || Number.isNaN(Date.parse(filedAt))) return null;
  const items: FilingItem[] = Array.isArray(raw.items)
    ? raw.items
        .map((item) => {
          const row = (item ?? {}) as Record<string, unknown>;
          const code = typeof row.code === "string" ? row.code : "";
          const label = typeof row.label === "string" ? row.label : "";
          return code && label ? { code, label } : null;
        })
        .filter((item): item is FilingItem => item !== null)
    : [];
  const form = typeof raw.form === "string" && raw.form.trim() ? raw.form.trim() : raw.form_group;
  return {
    id,
    ticker,
    company: typeof raw.company === "string" && raw.company.trim() ? raw.company.trim() : ticker,
    form,
    group: raw.form_group,
    amendment: raw.is_amendment === true,
    headline: typeof raw.headline === "string" ? raw.headline.trim() : "",
    items,
    filedAt,
    url,
  };
}

export function parseFilingGroup(value: string | null | undefined): FilingGroup | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  const alias = upper === "13D" || upper === "13G" || upper === "13DG" ? "13D/G" : upper;
  return isGroup(alias) ? alias : null;
}

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: false });
const ET_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });

/** The New York calendar day a filing was accepted on, "YYYY-MM-DD". */
export function filingDay(filedAt: string): string {
  return ET_DAY.format(new Date(filedAt));
}

/** "16:31" in New York time. */
export function filingTime(filedAt: string): string {
  return ET_TIME.format(new Date(filedAt)).replace(/^24:/, "00:");
}

/** "Fri, Nov 6" in New York time. */
export function filingDayLabel(filedAt: string): string {
  return ET_LABEL.format(new Date(filedAt));
}

/** Group a newest-first list into days, keeping order. */
export function groupFilingsByDay(filings: Filing[]): Array<{ day: string; label: string; filings: Filing[] }> {
  const out: Array<{ day: string; label: string; filings: Filing[] }> = [];
  for (const filing of filings) {
    const day = filingDay(filing.filedAt);
    const last = out[out.length - 1];
    if (last && last.day === day) last.filings.push(filing);
    else out.push({ day, label: filingDayLabel(filing.filedAt), filings: [filing] });
  }
  return out;
}
