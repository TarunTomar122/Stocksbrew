import { shortCompanyName } from "@/lib/plain-copy";

/**
 * Is a "reason" for a stock's move only the move said again? "Semiconductor rally drives SOXL higher", "NTES
 * reverses recent gains" and "X sharply underperforms a weaker market" name no cause, so they are no reason at all
 * (owner rules 7 and 8: when a reason isn't real, write nothing). A line counts as a reason only when, with the
 * stock's own ticker and name taken out, it still names a cause: results, guidance, a deal, a contract, an analyst
 * call, a regulator, a court, a boss, the economy, a commodity. Pure, so every surface that shows a confirmed
 * reason (briefing, Market today, Signals, the home page, My stocks) applies the same test.
 */

// Words that name a cause. Move words ("rally", "surge", "gains", "reverses", "underperforms") are left out on
// purpose, so a line made of them and the stock's name is circular. Each entry is a regex fragment matched on word
// boundaries in lower case.
const CAUSES = [
  // Results and what the company says about the future.
  "earnings?", "results?", "revenues?", "sales", "profits?(?![- ]taking)", "margins?", "eps", "quarterly (?:results|report)",
  "q[1-4]", "fy\\d{2,4}", "(?:first|second|third|fourth)[- ]quarter", "guidance", "outlook", "forecasts?", "projections?",
  "targets?", "miss(?:es|ed)?", "beats? (?:on|estimates|expectations|forecasts|views|the consensus)", "expectations", "estimates", "consensus", "(?:earnings|quarterly|annual|10-[kq]|jobs|inflation|cpi) report",
  "(?:business|product|guidance|strategic|investor) update", "top and bottom line",
  "bookings", "backlog", "shipments", "deliveries", "production", "subscribers", "users", "same-store",
  // Deals and corporate actions.
  "deals?", "mergers?", "acquisitions?", "acquir(?:e|es|ed|ing)", "buyout", "takeover", "bids?", "offers?", "stakes?",
  "spin-?off", "split", "ipo", "offering", "listing", "delist(?:ing|ed)?", "spac", "dividends?", "buybacks?",
  "repurchases?", "debt", "loans?", "financing", "funding", "notes", "convertible", "bankruptcy", "chapter 11",
  "default", "restructuring", "lock-?ups?", "dilution", "nasdaq-100", "index (?:addition|inclusion|rebalanc\\w*)",
  "invest(?:s|ed|ment)?", "pacts?", "stimulus", "tariffs?", "sanctions?", "export (?:ban|curbs?|controls?)", "layoffs?", "job cuts", "activist", "inclusion", "s&p 500 (?:addition|index)",
  "(?:joins?|added to|adds? to) the s&p", "added to (?:the )?s&p",
  // Customers and products.
  "contracts?", "orders?", "agreements?", "partnerships?", "partners?", "collaboration", "licens(?:e|es|ing)",
  "customers?", "clients?", "awards?", "awarded", "wins?", "won", "launch(?:es|ed)?", "unveil(?:s|ed)?", "products?",
  "releases?", "recalls?", "outages?", "breach", "hack", "cyber\\w*", "crash(?:es)?", "hurricanes?", "storms?", "wildfires?",
  "costs?", "fuel", "cash (?:burn|flow)", "burn rate", "strikes?", "demand", "supply", "shortages?", "capacity",
  "spending", "capex", "data cent(?:er|re)s?", "pricing", "price (?:cuts?|hikes?|increases?)", "traffic",
  // "Growth stocks rally" and "rallies with rivals" are sector moves, so only growth the company reports counts.
  "(?:strong|weak|slow(?:er|ing)?|fast(?:er)?|sales|revenue|earnings|profit|user|subscriber|organic|record) growth",
  "growth (?:outlook|forecast|targets?)", "competition", "projects?", "timelines?", "delays?", "delayed", "permits?",
  "capital", "investments?",
  // Analysts.
  "upgrades?", "upgraded", "downgrades?", "downgraded", "price targets?", "ratings?", "analysts?", "coverage",
  "initiat(?:es|ed)", "short sellers?", "short report",
  // Regulators, courts and governments.
  "fda", "approvals?", "approv(?:e|es|ed)", "clearance", "trials?", "study", "studies", "phase [1-3i]+", "drugs?",
  "vaccines?", "clinical", "(?:topline|trial|study) data", "patents?", "lawsuits?", "suits?", "sues", "sued", "courts?", "rulings?", "judge", "verdict",
  "settlements?", "probes?", "investigations?", "subpoena", "sec", "doj", "ftc", "antitrust", "regulators?",
  "regulatory", "fines?", "medicaid", "medicare", "reimbursements?", "tariffs?", "sanctions?", "bans?", "exports?", "imports?", "subsid(?:y|ies)", "grants?",
  "policy", "government", "pentagon", "white house", "president", "congress", "senate", "election", "shutdown", "war",
  // Bosses and insiders.
  "ceo", "cfo", "coo", "chief", "founder", "chair(?:man|woman)?", "executives?", "board (?:of directors|approv\\w*|members?|seats?)",
  "resign(?:s|ed|ation)?",
  "steps down", "appoint(?:s|ed|ment)?", "hires?", "insiders?", "filings?", "8-k", "13d", "13f",
  // The economy and what it trades on.
  "fed", "federal reserve", "interest rates?", "rate[- ](?:cuts?|hikes?)", "inflation", "cpi", "ppi", "jobs report",
  "payrolls", "economic data", "gdp", "recession", "oil", "crude", "gas prices", "gold", "bitcoin", "crypto", "ether(?:eum)?",
  "commodit(?:y|ies)", "yields?", "treasur(?:y|ies)", "dollar",
];

const CAUSE_RE = new RegExp(`(?:^|[^a-z0-9&])(?:${CAUSES.join("|")})(?=$|[^a-z0-9])`, "i");

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The ways a line can name the company itself: its full name and the name without its legal tail, longest first. */
function selfNames(name: string | null | undefined): string[] {
  const out = new Set<string>();
  const add = (value: string | null | undefined) => {
    const clean = (value ?? "").replace(/\s+/g, " ").trim();
    if (clean.length >= 2) out.add(clean.toLowerCase());
  };
  add(name);
  if (name) add(shortCompanyName(name));
  // Longest first, so "Oil States International" goes before "Oil States".
  return [...out].sort((a, b) => b.length - a.length);
}

/**
 * True when `text` gives no cause once the stock's own ticker and name are taken out. An empty text is circular too:
 * there is nothing to show either way.
 */
export function isCircularReason(text: string | null | undefined, ticker?: string | null, name?: string | null): boolean {
  let rest = ` ${(text ?? "").replace(/\s+/g, " ").trim()} `;
  if (!rest.trim()) return true;
  // The ticker only as written, in capitals: "GOLD" is Barrick's ticker, "gold" in a sentence is the metal.
  const symbol = (ticker ?? "").trim().toUpperCase();
  if (symbol) rest = rest.replace(new RegExp(`(^|[^A-Za-z0-9])${escape(symbol)}(?:'s|’s)?(?=$|[^A-Za-z0-9])`, "g"), "$1 ");
  rest = rest.toLowerCase();
  for (const self of selfNames(name)) {
    rest = rest.replace(new RegExp(`(^|[^a-z0-9])${escape(self)}(?:'s|’s)?(?=$|[^a-z0-9])`, "g"), "$1 ");
  }
  return !CAUSE_RE.test(rest);
}

/** The reason when it names a cause, else null: the chip treatment, as for a move with no reason. */
export function realReason(text: string | null | undefined, ticker?: string | null, name?: string | null): string | null {
  const clean = (text ?? "").trim();
  return clean && !isCircularReason(clean, ticker, name) ? clean : null;
}
