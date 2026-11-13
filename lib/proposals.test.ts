import { describe, expect, it } from "vitest";

import {
  alertFromDoc,
  candidates,
  levelScale,
  outcomesOf,
  EXPIRY_DAYS,
  filingSaid,
  isWaiting,
  MAX_PENDING,
  newProposal,
  pickNew,
  proposalId,
  readProposal,
  refreshOf,
  repeatsTitle,
  staleReason,
  titleCase,
  TITLE_MAX_WORDS,
  toCard,
  waitingOf,
  WHY_MAX_WORDS,
  wordCount,
  type ProposalAlert,
  type ProposalDraft,
  type ProposalInputs,
  type ProposalKind,
} from "./proposals";

const TODAY = "2026-11-12";
const NOW = new Date("2026-11-12T18:00:00.000Z");

/** 60 closes ending yesterday, flat at `level` with a dip to `low` twenty sessions back. */
function series(last: number, opts: { low?: number; high?: number; tail?: number[] } = {}) {
  const out: Array<{ date: string; close: number }> = [];
  const start = new Date("2026-08-10T12:00:00Z");
  for (let index = 0; index < 60; index += 1) {
    const day = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10);
    let close = last * 1.1;
    if (index === 40 && opts.low) close = opts.low;
    if (index === 41 && opts.high) close = opts.high;
    out.push({ date: day, close });
  }
  const tail = opts.tail ?? [last];
  tail.forEach((close, index) => {
    out[out.length - tail.length + index] = { date: shift(TODAY, index - tail.length), close };
  });
  return out;
}

function shift(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const NVDA = { ticker: "NVDA", instrumentId: "US_NVDA", position: "holding" as const };

function inputs(patch: Partial<ProposalInputs> = {}): ProposalInputs {
  return {
    now: NOW,
    today: TODAY,
    plan: "pro",
    stocks: [NVDA],
    levels: {},
    calls: {},
    series: {},
    quotes: {},
    alerts: [],
    results: [],
    filings: [],
    reasons: {},
    runs: [],
    jobs: [],
    upcoming: [],
    ...patch,
  };
}

const alert = (patch: Partial<ProposalAlert> = {}): ProposalAlert => ({
  id: "a1",
  ticker: "NVDA",
  instrumentId: "US_NVDA",
  kind: "price_threshold",
  condition: "below",
  price: 142,
  live: true,
  triggered: false,
  triggeredAt: null,
  createdAt: "2026-11-01T10:00:00.000Z",
  ...patch,
});

function only(list: ProposalDraft[], kind: ProposalKind): ProposalDraft {
  const found = list.filter((draft) => draft.kind === kind);
  expect(found).toHaveLength(1);
  return found[0]!;
}

function withinBudget(draft: ProposalDraft) {
  expect(wordCount(draft.title)).toBeLessThanOrEqual(TITLE_MAX_WORDS);
  expect(draft.why.length).toBeGreaterThan(0);
  expect(draft.why.length).toBeLessThanOrEqual(2);
  for (const line of draft.why) expect(wordCount(line)).toBeLessThanOrEqual(WHY_MAX_WORDS);
  // The title is the action and the card's line is what set it off: no dollar figure said in both (judge 89).
  const figures = (text: string) => text.match(/\$[\d,.]+\d/g) ?? [];
  for (const figure of figures(draft.title)) expect(draft.why[0]).not.toContain(figure);
  expect(draft.does.length).toBeGreaterThan(0);
  expect(draft.read.length).toBeGreaterThan(0);
  for (const source of draft.read) expect(source.at).toBeTruthy();
}

describe("event → proposal", () => {
  // What the alert job writes when an alert fires (backend/price_alerts.py mark_alert_triggered): triggered, and off.
  const fired = (patch: Partial<ProposalAlert> = {}) => alert({ live: false, triggered: true, triggeredAt: "2026-11-12T15:10:00.000Z", ...patch });

  it("sets the next alert after one fired, at the next level down, exact", () => {
    const list = candidates(inputs({ alerts: [fired()], quotes: { NVDA: { price: 139.8, dayPct: -4.2, at: "2026-11-12T17:00:00Z" } }, series: { NVDA: series(139.8, { low: 131.2 }) } }));
    const draft = only(list, "alert_hit");
    expect(draft.title).toBe("Move NVDA's alert down to $131.20");
    expect(draft.why[0]).toBe("NVDA hit your $142 alert today and is at $139.80.");
    expect(draft.why[1]).toBe("The next level down is $131.20, its 60-day low.");
    // The fired alert is already off: nothing to turn off.
    expect(draft.action).toEqual({ type: "alert_price", ticker: "NVDA", instrument_id: "US_NVDA", condition: "below", price: 131.2, replaces: null });
    expect(draft.figures).toContainEqual({ label: "Today", value: "−4.2%" });
    expect(draft.figures).toContainEqual({ label: "60-day low", value: "$131.20" });
    withinBudget(draft);
  });

  it("reads a stored fired alert as fired: the alert job writes triggered and active false together", () => {
    const stamp = "2026-11-12T15:10:00.000Z";
    const doc = { uid: "u1", ticker: "nvda", instrument_id: "US_NVDA", kind: "price_threshold", condition: "below", target_price: 142, active: false, triggered: true, triggered_at: stamp, updated_at: stamp, created_at: "2026-11-01T10:00:00.000Z" };
    expect(alertFromDoc("a1", doc)).toMatchObject({ id: "a1", ticker: "NVDA", live: false, triggered: true, triggeredAt: stamp, price: 142 });
    // Turned off by the person after it fired (a later updated_at): not offered again.
    expect(alertFromDoc("a1", { ...doc, updated_at: "2026-11-12T18:00:00.000Z" }).triggered).toBe(false);
    // A live one.
    expect(alertFromDoc("a2", { ...doc, active: true, triggered: false, triggered_at: undefined })).toMatchObject({ live: true, triggered: false });
    // Paused when its stock left the list: not live.
    expect(alertFromDoc("a3", { ...doc, active: true, triggered: false, paused_reason: "removed" }).live).toBe(false);
  });

  it("one proposal per firing: a moving price does not make a new one after a dismiss", () => {
    const at = (price: number) => only(candidates(inputs({ alerts: [fired()], quotes: { NVDA: { price, dayPct: -1, at: null } } })), "alert_hit");
    expect(proposalId(at(139).event.key)).toBe(proposalId(at(137).event.key));
  });

  it("uses the buy-more level, exact, when it is the nearer level under the price", () => {
    const list = candidates(inputs({ alerts: [fired()], levels: { NVDA: { add_below: 135.42, trim_above: 190 } }, quotes: { NVDA: { price: 139.8, dayPct: -4.2, at: null } }, series: { NVDA: series(139.8, { low: 120 }) } }));
    expect(only(list, "alert_hit").action).toMatchObject({ price: 135.42 });
  });

  it("never touches a live alert, even one the price is past: it emails first", () => {
    expect(candidates(inputs({ alerts: [alert()], quotes: { NVDA: { price: 139, dayPct: -2, at: null } }, series: { NVDA: series(139) } }))).toEqual([]);
    expect(candidates(inputs({ alerts: [alert()], quotes: { NVDA: { price: 150, dayPct: 0, at: null } } }))).toEqual([]);
  });

  it("a fired alert days ago, or one the price came back from, makes nothing", () => {
    const quotes = { NVDA: { price: 139.8, dayPct: -1, at: null } };
    expect(candidates(inputs({ alerts: [fired({ triggeredAt: "2026-11-01T15:00:00.000Z" })], quotes }))).toEqual([]);
    expect(candidates(inputs({ alerts: [fired()], quotes: { NVDA: { price: 150, dayPct: 1, at: null } } }))).toEqual([]);
  });

  it("a Free plan with every alert slot taken gets no new-alert proposals", () => {
    const full = Array.from({ length: 5 }, (_, index) => alert({ id: `l${index}`, ticker: "AAPL", instrumentId: "US_AAPL", price: 100 + index }));
    const base = { alerts: [...full, fired()], quotes: { NVDA: { price: 139.8, dayPct: -4.2, at: null } }, series: { NVDA: series(139.8, { low: 131.2 }) } };
    expect(candidates(inputs({ ...base, plan: "free" }))).toEqual([]);
    expect(candidates(inputs({ ...base, plan: "pro" })).map((draft) => draft.kind)).toEqual(["alert_hit"]);
  });

  it("after results with lowered guidance sets an alert under the stock", () => {
    const list = candidates(
      inputs({
        results: [{ ticker: "NVDA", reportDate: "2026-11-11", movePct: -7.4, guidance: "lowered", epsVerdict: "miss", epsSurprisePct: -3.2, revenueVerdict: "beat", sources: [{ label: "results release", at: "2026-11-11T21:05:00Z", url: "https://example.com/pr" }] }],
        quotes: { NVDA: { price: 160, dayPct: -7.4, at: null } },
        levels: { NVDA: { add_below: 158, trim_above: 200 } },
        series: { NVDA: series(160) },
      }),
    );
    const draft = only(list, "results");
    expect(draft.title).toBe("Set an alert on NVDA at $152");
    expect(draft.why[0]).toBe("NVDA reported yesterday, lowered its guidance, missed on earnings by 3.2% and fell 7.4%.");
    expect(draft.read[0]).toEqual({ label: "NVDA results release", at: "2026-11-11T21:05:00Z", href: "https://example.com/pr" });
    withinBudget(draft);
  });

  it("says what results did in one plain sentence, with or without a move", () => {
    const read = { ticker: "NVDA", reportDate: "2026-11-11", movePct: null, guidance: "lowered" as const, epsVerdict: null, epsSurprisePct: null, revenueVerdict: null, sources: [] };
    const draft = only(candidates(inputs({ results: [read], quotes: { NVDA: { price: 160, dayPct: -1, at: null } } })), "results");
    expect(draft.why[0]).toBe("NVDA reported yesterday and lowered its guidance.");
    // Without the alerts read there is no knowing what is set: nothing.
    expect(candidates(inputs({ results: [read], alerts: undefined, quotes: { NVDA: { price: 160, dayPct: -1, at: null } } }))).toEqual([]);
  });

  it("after results moves an existing alert that sits too far from the new level", () => {
    const list = candidates(
      inputs({
        alerts: [alert({ price: 120 })],
        results: [{ ticker: "NVDA", reportDate: "2026-11-11", movePct: -6, guidance: null, epsVerdict: null, epsSurprisePct: null, revenueVerdict: null, sources: [] }],
        quotes: { NVDA: { price: 160, dayPct: -6, at: null } },
        levels: { NVDA: { add_below: 158, trim_above: 200 } },
        series: { NVDA: series(160) },
      }),
    );
    const draft = only(list, "results");
    expect(draft.title).toBe("Move NVDA's $120 alert to $152");
    expect(draft.action).toMatchObject({ replaces: { alert_id: "a1", price: 120 } });
  });

  it("a call change to Buy more sets an alert at its buy-more level, or a practice buy when already under it", () => {
    const calls = { NVDA: { call: "Add" as const, changes: [{ date: "2026-11-11", from: "Hold" as const, to: "Add" as const }] } };
    const levels = { NVDA: { add_below: 142.07, trim_above: 190 } };
    const above = candidates(inputs({ calls, levels, quotes: { NVDA: { price: 150, dayPct: 1, at: null } } }));
    const alertDraft = only(above, "call_change");
    // The call's own level, exact, as the stock page prints it.
    expect(alertDraft.title).toBe("Set an alert at NVDA's $142.07 buy-more level");
    expect(alertDraft.action).toMatchObject({ type: "alert_price", condition: "below", price: 142.07 });
    withinBudget(alertDraft);
    const under = candidates(inputs({ calls, levels, quotes: { NVDA: { price: 139, dayPct: -2, at: null } } }));
    const practice = only(under, "call_change");
    expect(practice.action).toEqual({ type: "practice_ticket", ticker: "NVDA", side: "buy" });
    withinBudget(practice);
  });

  it("a call change says nothing for a stock the plan does not cover (levels locked)", () => {
    const calls = { NVDA: { call: "Add" as const, changes: [{ date: "2026-11-11", from: "Hold" as const, to: "Add" as const }] } };
    expect(candidates(inputs({ calls, levels: { NVDA: { add_below: null, trim_above: null, locked: true } }, quotes: { NVDA: { price: 150, dayPct: 1, at: null } } }))).toEqual([]);
  });

  it("a Sell some call on a watched stock makes nothing (no sale beside a stock you do not hold)", () => {
    const calls = { NVDA: { call: "Trim" as const, changes: [{ date: "2026-11-11", from: "Hold" as const, to: "Trim" as const }] } };
    const list = candidates(inputs({ stocks: [{ ...NVDA, position: "watchlist" }], calls, levels: { NVDA: { add_below: 100, trim_above: 190 } }, quotes: { NVDA: { price: 150, dayPct: 1, at: null } } }));
    expect(list.filter((draft) => draft.kind === "call_change")).toEqual([]);
  });

  it("a practice sale is only offered when the practice account holds the stock", () => {
    const calls = { NVDA: { call: "Trim" as const, changes: [{ date: "2026-11-11", from: "Hold" as const, to: "Trim" as const }] } };
    const base = { calls, levels: { NVDA: { add_below: 100, trim_above: 190 } }, quotes: { NVDA: { price: 195, dayPct: 1, at: null } } };
    expect(candidates(inputs({ ...base, practice: {} }))).toEqual([]);
    expect(only(candidates(inputs({ ...base, practice: { NVDA: 10 } })), "call_change").action).toEqual({ type: "practice_ticket", ticker: "NVDA", side: "sell" });
  });

  it("a close that crossed into the buy-more zone on a Buy more call opens a practice buy", () => {
    const list = candidates(
      inputs({
        calls: { NVDA: { call: "Add", changes: [] } },
        levels: { NVDA: { add_below: 142 } },
        series: { NVDA: series(139, { tail: [146, 145, 139] }) },
        quotes: { NVDA: { price: 139.5, dayPct: 0.3, at: null } },
      }),
    );
    const draft = only(list, "level_reached");
    expect(draft.action).toEqual({ type: "practice_ticket", ticker: "NVDA", side: "buy" });
    expect(draft.event.key).toBe(`level:NVDA:buy:${shift(TODAY, -1)}`);
    // A close at the level itself says the figure once.
    const at = only(candidates(inputs({ calls: { NVDA: { call: "Add", changes: [] } }, levels: { NVDA: { add_below: 142 } }, series: { NVDA: series(142, { tail: [146, 145, 142] }) }, quotes: { NVDA: { price: 141.5, dayPct: 0.3, at: null } } })), "level_reached");
    expect(at.why[0]).toBe("NVDA closed at its $142 buy-more level yesterday.");
    withinBudget(draft);
  });

  it("a big drop an agent found a sourced reason for sets an alert; one without a source makes nothing", () => {
    const run = (url: string | null) => ({
      id: "r1",
      job_id: "j1",
      job_name: "Big daily moves",
      day: "2026-11-11",
      ran_at: "2026-11-11T21:30:00Z",
      decision: "notify" as const,
      findings: [{ ticker: "NVDA", headline: "NVDA fell 8%", kind: "move", change_pct: -8.1, close: 150, url, source: "Reuters", at: "2026-11-11" }],
    });
    const base = { quotes: { NVDA: { price: 150, dayPct: -8.1, at: null } }, series: { NVDA: series(150) } };
    const draft = only(candidates(inputs({ ...base, runs: [run("https://example.com/story")] })), "big_move");
    expect(draft.title).toBe("Set an alert on NVDA at $143");
    withinBudget(draft);
    expect(candidates(inputs({ ...base, runs: [run(null)] })).filter((entry) => entry.kind === "big_move")).toEqual([]);
  });

  it("a major filing with no filings agent proposes one; a paused one is turned back on", () => {
    const filing = { ticker: "NVDA", filed_at: "2026-11-11T20:10:00Z", line: "Filed an 8-K on a new material agreement", url: "https://www.sec.gov/x" };
    const create = only(candidates(inputs({ filings: [filing] })), "filing");
    expect(create.action).toMatchObject({ type: "agent_create", template: "sec-filing", scope: { kind: "watchlist" } });
    expect(create.why[0]).toBe("Yesterday, NVDA filed an 8-K on a new material agreement.");
    withinBudget(create);
    const paused = { id: "job123456", name: "New SEC filings from my names", enabled: false, template: "sec-filing", trigger: { type: "event" as const, event: "sec_filing" as const }, scope: { kind: "watchlist" as const } };
    const resume = only(candidates(inputs({ filings: [filing], jobs: [paused] })), "filing");
    expect(resume.action).toEqual({ type: "agent_enable", job_id: "job123456", job_name: "New SEC filings from my names", enabled: true });
    expect(candidates(inputs({ filings: [filing], jobs: [{ ...paused, enabled: true }] })).filter((entry) => entry.kind === "filing")).toEqual([]);
  });

  it("a broken reason on a holding sets an alert under it and never changes the holding", () => {
    const reasons = { NVDA: { verdict: "broken" as const, since: "2026-11-10", signals: [{ text: "Revenue growth slowed to 4% from 22%.", source: "10-Q", asOf: "2026-11-05", level: "hard" }] } };
    const kept = only(candidates(inputs({ reasons, quotes: { NVDA: { price: 150, dayPct: 0, at: null } }, series: { NVDA: series(150) } })), "reason_broken");
    expect(kept.action.type).toBe("alert_price");
    expect(kept.title).toBe("Set an alert on NVDA at $143");
    expect(kept.why[0]).toBe("Your reason check on NVDA turned broken on Tuesday.");
    withinBudget(kept);
  });

  it("a broken measurable line names itself and its figure, and shows the dated source", () => {
    const condition = {
      line: "Revenue growth is 18%, under your 20%.",
      source: "Revenue growth 18% after the Q3 report, Nov 4 (SEC 8-K)",
      asOf: "2026-11-05",
      href: "/stock/NVDA",
      label: "Revenue growth",
      now: "18%",
    };
    const reasons = { NVDA: { verdict: "broken" as const, since: "2026-11-10", signals: [{ text: condition.line, asOf: "2026-11-05", level: "hard" }], condition } };
    const kept = only(candidates(inputs({ reasons, quotes: { NVDA: { price: 150, dayPct: 0, at: null } }, series: { NVDA: series(150) } })), "reason_broken");
    expect(kept.why[0]).toBe("Revenue growth is 18%, under your 20%.");
    expect(kept.read[1]).toEqual({ label: condition.source, at: "2026-11-05", href: "/stock/NVDA" });
    expect(kept.figures).toContainEqual({ label: "Revenue growth", value: "18%" });
    expect(kept.action.type).toBe("alert_price");
    withinBudget(kept);
  });

  it("writes filings as sentences: a stake report, and an 8-K without a second 'on'", () => {
    expect(filingSaid("NVDA", "An investor reported an active stake over 5%", "2026-11-12", TODAY)).toBe("An investor reported an active stake in NVDA today.");
    expect(filingSaid("NVDA", "Filed an 8-K on a change in control", "2026-11-09", TODAY)).toBe("On Monday, NVDA filed an 8-K on a change in control.");
  });

  it("takes a filing's day in New York time: 8 PM ET is that day, not the next", () => {
    const late = { ticker: "NVDA", filed_at: "2026-11-11T01:30:00Z", line: "Filed an 8-K on a new material agreement", url: null };
    // 01:30 UTC on Nov 11 is 8:30 PM ET on Nov 10 (Tuesday).
    expect(only(candidates(inputs({ filings: [late] })), "filing").why[0]).toBe("On Tuesday, NVDA filed an 8-K on a new material agreement.");
  });

  it("a report within the week offers the earnings reminder on Pro, never on Free", () => {
    const upcoming = [{ ticker: "NVDA", date: "2026-11-19", session: "amc" as const, usualPct: 6.2 }];
    const draft = only(candidates(inputs({ upcoming })), "earnings_soon");
    expect(draft.action).toMatchObject({ type: "alert_earnings", report_date: "2026-11-19" });
    withinBudget(draft);
    expect(candidates(inputs({ upcoming, plan: "free" })).filter((entry) => entry.kind === "earnings_soon")).toEqual([]);
    expect(candidates(inputs({ upcoming, alerts: [alert({ kind: "earnings_24h", condition: null, price: null })] })).filter((entry) => entry.kind === "earnings_soon")).toEqual([]);
  });

  it("a paused earnings agent before a report is turned back on", () => {
    const job = { id: "job999999", name: "Earnings coming up", enabled: false, template: "earnings-ahead", trigger: { type: "event" as const, event: "earnings_approaching" as const, days_before: 3 }, scope: { kind: "watchlist" as const } };
    const upcoming = [{ ticker: "NVDA", date: "2026-11-14", session: "bmo" as const, usualPct: null }];
    const draft = only(candidates(inputs({ jobs: [job], upcoming })), "agent_resume");
    expect(draft.action).toEqual({ type: "agent_enable", job_id: "job999999", job_name: "Earnings coming up", enabled: true });
    // The action, then the report that set it off; the paused agent is the run log's line.
    expect(draft.title).toBe("Turn your earnings agent back on");
    expect(draft.why).toEqual(["NVDA reports on Saturday.", '"Earnings coming up" is paused.']);
    withinBudget(draft);
    // Free with every running slot taken: turning it on could only fail, so it is not offered.
    const running = Array.from({ length: 2 }, (_, index) => ({ ...job, id: `run${index}xxxx`, enabled: true, trigger: { type: "schedule" as const, cadence: "daily_open" as const } }));
    expect(candidates(inputs({ plan: "free", jobs: [job, ...running], upcoming })).filter((entry) => entry.kind === "agent_resume")).toEqual([]);
  });

  it("an agent whose last three runs could not check is offered a pause", () => {
    const job = { id: "jobfail001", name: "Morning check on my names", enabled: true, template: "morning-check", trigger: { type: "schedule" as const, cadence: "daily_open" as const }, scope: { kind: "watchlist" as const } };
    const runs = ["2026-11-10", "2026-11-11", "2026-11-12"].map((day, index) => ({ id: `r${index}`, job_id: job.id, job_name: job.name, day, ran_at: `${day}T13:00:00Z`, decision: "could_not_check" as const, findings: [] }));
    const draft = only(candidates(inputs({ jobs: [job], runs })), "agent_pause");
    expect(draft.action).toMatchObject({ type: "agent_enable", enabled: false });
    expect(draft.title).toBe('Pause "Morning check on…"');
    expect(draft.why[0]).toBe("Its last three runs couldn't read their data.");
    expect(draft.why[1]).toBe("You can turn it back on any time.");
    expect(only(candidates(inputs({ plan: "free", jobs: [job], runs })), "agent_pause").why[1]).toBe("Pausing it frees one of your running agent slots.");
    withinBudget(draft);
    expect(candidates(inputs({ jobs: [job], runs: runs.map((run, index) => (index === 0 ? { ...run, decision: "nothing" as const } : run)) })).filter((entry) => entry.kind === "agent_pause")).toEqual([]);
  });

  it("a stock an agent flagged that is not on the list is offered for Watching", () => {
    const runs = [{ id: "r9", job_id: "j9", job_name: "Insider trades in my names", day: "2026-11-11", ran_at: "2026-11-11T21:00:00Z", decision: "notify" as const, findings: [{ ticker: "PLTR", headline: "A director bought $2.1M of PLTR", kind: "insider", url: "https://www.sec.gov/y", source: "SEC Form 4", at: "2026-11-11" }] }];
    const draft = only(candidates(inputs({ runs })), "agent_flagged");
    expect(draft.action).toEqual({ type: "watch_add", ticker: "PLTR", instrument_id: "US_PLTR" });
    expect(draft.why[1]).toBe("A director bought $2.1M of PLTR.");
    withinBudget(draft);
    // A headline in Scraped Title Case is left out.
    expect(titleCase("Palantir Shares Jump After Director Buys Stock")).toBe(true);
    expect(titleCase("A director bought $2.1M of PLTR")).toBe(false);
  });

  it("an event older than the window makes nothing", () => {
    const calls = { NVDA: { call: "Add" as const, changes: [{ date: "2026-11-01", from: "Hold" as const, to: "Add" as const }] } };
    expect(candidates(inputs({ calls, levels: { NVDA: { add_below: 142 } }, quotes: { NVDA: { price: 150, dayPct: 1, at: null } } }))).toEqual([]);
  });

  it("a missing read makes nothing rather than a guess", () => {
    expect(candidates(inputs({ alerts: undefined, quotes: undefined, series: undefined, jobs: undefined, filings: [{ ticker: "NVDA", filed_at: "2026-11-11T20:10:00Z", line: "Filed an 8-K", url: null }] }))).toEqual([]);
  });
});

describe("dedupe and limits", () => {
  const draftFor = (ticker: string, key: string, idea = `alert:${ticker}:below:100`): ProposalDraft => ({
    kind: "alert_hit",
    ticker,
    instrument_id: `US_${ticker}`,
    event: { key, kind: "alert_hit", at: TODAY, refs: [] },
    idea,
    title: `Move ${ticker}'s alert`,
    why: ["Because."],
    does: "Sets it.",
    read: [{ label: "x", at: TODAY, href: null }],
    figures: [],
    action: { type: "alert_price", ticker, instrument_id: `US_${ticker}`, condition: "below", price: 100, replaces: null },
    priority: 50,
  });

  it("the id is the event's: the same event is never stored twice", () => {
    expect(proposalId("alert:a1:142")).toBe(proposalId("alert:a1:142"));
    expect(proposalId("alert:a1:142")).not.toBe(proposalId("alert:a1:143"));
    expect(proposalId("x")).toMatch(/^[0-9a-f]{16}$/);
    const stored = newProposal("u1", draftFor("NVDA", "e1"), NOW);
    expect(pickNew([draftFor("NVDA", "e1")], [{ ...stored, status: "dismissed" }], NOW)).toEqual([]);
  });

  it("does not propose an idea again within the cooldown, even after a dismissal", () => {
    const old = newProposal("u1", draftFor("NVDA", "e1"), new Date(NOW.getTime() - 3 * 86_400_000));
    expect(pickNew([draftFor("NVDA", "e2")], [{ ...old, status: "dismissed" }], NOW)).toEqual([]);
    const older = newProposal("u1", draftFor("NVDA", "e1"), new Date(NOW.getTime() - 20 * 86_400_000));
    expect(pickNew([draftFor("NVDA", "e2")], [{ ...older, status: "dismissed" }], NOW)).toHaveLength(1);
  });

  it("one waiting proposal per stock, and never more than MAX_PENDING waiting", () => {
    const drafts = ["A", "A", "B", "C", "D", "E", "F", "G"].map((ticker, index) => draftFor(ticker, `e${index}`, `idea${index}`));
    const picked = pickNew(drafts, [], NOW);
    expect(picked.map((draft) => draft.ticker)).toEqual(["A", "B", "C", "D", "E"]);
    expect(picked).toHaveLength(MAX_PENDING);
    const waiting = [newProposal("u1", draftFor("Z", "z1", "iz"), NOW), newProposal("u1", draftFor("Y", "y1", "iy"), NOW)];
    expect(pickNew(drafts, waiting, NOW)).toHaveLength(MAX_PENDING - 2);
  });

  it("a proposal past its expiry no longer waits, and stops counting toward the limit", () => {
    const stored = newProposal("u1", draftFor("NVDA", "e1"), NOW);
    expect(Date.parse(stored.expires_at) - NOW.getTime()).toBe(EXPIRY_DAYS * 86_400_000);
    expect(isWaiting(stored, NOW)).toBe(true);
    const later = new Date(NOW.getTime() + (EXPIRY_DAYS + 1) * 86_400_000);
    expect(isWaiting(stored, later)).toBe(false);
    expect(waitingOf([stored], later)).toEqual([]);
    expect(staleReason(stored, inputs({ now: later }))).toBe("expired");
  });

  it("an accept stuck mid-way is released after a while", () => {
    const stored = { ...newProposal("u1", draftFor("NVDA", "e1"), NOW), status: "applying" as const };
    expect(isWaiting(stored, NOW)).toBe(false);
    expect(isWaiting(stored, new Date(NOW.getTime() + 5 * 60_000))).toBe(true);
  });

  it("goes stale when the fact changed: the alert was set, the price went past the level, the stock was added", () => {
    const stored = newProposal("u1", draftFor("NVDA", "e1"), NOW);
    expect(staleReason(stored, inputs({ alerts: [alert({ price: 100 })] }))).toBe("alert_set");
    expect(staleReason(stored, inputs({ quotes: { NVDA: { price: 99, dayPct: -1, at: null } } }))).toBe("price_past_level");
    expect(staleReason(stored, inputs({ quotes: { NVDA: { price: 120, dayPct: -1, at: null } } }))).toBeNull();
    // A failed read says nothing either way.
    expect(staleReason(stored, inputs({ alerts: undefined, quotes: undefined, series: undefined }))).toBeNull();
    const watch = newProposal("u1", { ...draftFor("PLTR", "w1"), action: { type: "watch_add", ticker: "PLTR", instrument_id: "US_PLTR" } }, NOW);
    expect(staleReason(watch, inputs({ stocks: [{ ticker: "PLTR", instrumentId: "US_PLTR", position: "watchlist" }] }))).toBe("tracked");
    const ticket = newProposal("u1", { ...draftFor("META", "p1"), action: { type: "practice_ticket", ticker: "META", side: "buy" } }, NOW);
    // A stock missing from the calls read says nothing; a call that moved off Buy more makes it stale.
    expect(staleReason(ticket, inputs({ calls: {} }))).toBeNull();
    expect(staleReason(ticket, inputs({ calls: { META: { call: "Hold", changes: [] } } }))).toBe("call_changed");
  });

  it("a waiting proposal made again with newer numbers takes them; a different action leaves it as offered", () => {
    const stored = newProposal("u1", draftFor("NVDA", "e1"), NOW);
    expect(refreshOf(stored, draftFor("NVDA", "e1"))).toBeNull();
    const newer = { ...draftFor("NVDA", "e1"), figures: [{ label: "Price", value: "$101" }] };
    expect(refreshOf(stored, newer)).toMatchObject({ figures: [{ label: "Price", value: "$101" }] });
    const other = { ...newer, action: { ...newer.action, price: 95 } as ProposalDraft["action"] };
    expect(refreshOf(stored, other)).toBeNull();
    expect(refreshOf(stored, draftFor("NVDA", "e2"))).toBeNull();
    // The store hands keys back in its own order: the same action still matches.
    const reordered = JSON.parse(JSON.stringify({ ...stored, action: Object.fromEntries(Object.entries(stored.action).reverse()) }));
    expect(refreshOf(reordered, newer)).not.toBeNull();
  });

  it("the card leaves out an 'if you accept' line that only repeats the title", () => {
    expect(repeatsTitle("Get a reminder the day before NVDA reports", "Emails you the day before NVDA reports.")).toBe(true);
    expect(repeatsTitle("Set an alert at $33.66 after ASTS's results drop", "Emails you if ASTS falls to $33.66.")).toBe(true);
    expect(repeatsTitle("Try buying META in your practice account", "Opens a practice ticket to buy META. You place the order there.")).toBe(false);
    expect(repeatsTitle("Move NVDA's $142 alert down to $131.20", "Emails you if NVDA falls to $131.20. Your $142 alert already fired.")).toBe(true);
  });

  it("a card keeps a price: the fresh quote, else the one from the last sync", () => {
    const stored = { ...newProposal("u1", draftFor("NVDA", "e1"), NOW), quote: { price: 140, dayPct: -2, at: null } };
    expect(toCard(stored, null).quote).toEqual({ price: 140, dayPct: -2 });
    expect(toCard(stored, { price: 141, dayPct: -1.5, at: null }).quote).toEqual({ price: 141, dayPct: -1.5 });
    expect(readProposal(JSON.parse(JSON.stringify(stored)))?.quote).toEqual({ price: 140, dayPct: -2, at: null });
  });

  it("the record keeps answered and stale proposals, never a waiting one", () => {
    const base = newProposal("u1", draftFor("NVDA", "e1"), new Date(NOW.getTime() - 86_400_000));
    const accepted = { ...base, id: "a", status: "accepted" as const, decided_at: "2026-11-12T10:00:00.000Z", result: { ok: true, code: "done", message: "Alert set: NVDA below $100.", at: "2026-11-12T10:00:00.000Z" } };
    const dismissed = { ...base, id: "d", status: "dismissed" as const, decided_at: "2026-11-11T10:00:00.000Z" };
    const stale = { ...base, id: "x", status: "expired" as const, expired_reason: "price_past_level", updated_at: "2026-11-10T10:00:00.000Z" };
    const lapsed = { ...base, id: "l", expires_at: "2026-11-12T00:00:00.000Z" };
    const old = { ...base, id: "o", status: "dismissed" as const, decided_at: "2026-10-01T10:00:00.000Z" };
    const outcomes = outcomesOf([base, accepted, dismissed, stale, lapsed, old], NOW);
    expect(outcomes.map((entry) => [entry.id, entry.status])).toEqual([
      ["a", "accepted"],
      ["l", "expired"],
      ["d", "dismissed"],
      ["x", "expired"],
    ]);
    expect(outcomes[0]!.message).toBe("Alert set: NVDA below $100.");
    // One that ran out of time is dated by its expiry, not by when a sync noticed it.
    const timedOut = { ...base, id: "t", status: "expired" as const, expired_reason: "expired", expires_at: "2026-11-09T09:00:00.000Z", updated_at: "2026-11-12T09:00:00.000Z" };
    expect(outcomesOf([timedOut], NOW)[0]!.at).toBe("2026-11-09T09:00:00.000Z");
  });

  it("the level bar's scale is fixed around the price, so gaps compare across cards", () => {
    expect(levelScale(100, 100)).toEqual({ nowAt: 50, levelAt: 50, gapPct: 0 });
    expect(levelScale(100, 97.6).levelAt).toBeCloseTo(38, 0);
    expect(levelScale(100, 104.4).levelAt).toBeCloseTo(72, 0);
    // A far level widens the scale and stays on the bar.
    expect(levelScale(100, 60).levelAt).toBeGreaterThanOrEqual(0);
    expect(levelScale(100, 60).levelAt).toBeLessThan(50);
  });

  it("every proposal's line is one sentence of at most 15 words, and its run log names only the level it acts on", () => {
    const calls = { NVDA: { call: "Add" as const, changes: [{ date: "2026-11-11", from: "Hold" as const, to: "Add" as const }] } };
    const all = [
      ...candidates(inputs({ alerts: [alert({ live: false, triggered: true, triggeredAt: "2026-11-12T15:10:00.000Z" })], levels: { NVDA: { add_below: 135, trim_above: 190 } }, quotes: { NVDA: { price: 139.8, dayPct: -4.2, at: null } }, series: { NVDA: series(139.8, { low: 120 }) } })),
      ...candidates(
        inputs({
          results: [{ ticker: "NVDA", reportDate: "2026-11-11", movePct: -8.7, guidance: "lowered", epsVerdict: "miss", epsSurprisePct: -7.3, revenueVerdict: null, sources: [] }],
          levels: { NVDA: { add_below: 120, trim_above: 190 } },
          quotes: { NVDA: { price: 160, dayPct: -8.7, at: null } },
          series: { NVDA: series(160) },
        }),
      ),
      ...candidates(inputs({ calls, levels: { NVDA: { add_below: 142.07, trim_above: 190 } }, quotes: { NVDA: { price: 150, dayPct: 1, at: null } } })),
      ...candidates(inputs({ filings: [{ ticker: "NVDA", filed_at: "2026-11-11T20:10:00Z", line: "Filed an 8-K on a new material agreement", url: null }] })),
      ...candidates(inputs({ upcoming: [{ ticker: "NVDA", date: "2026-11-19", session: "amc", usualPct: 6.2 }] })),
    ];
    expect(new Set(all.map((draft) => draft.kind)).size).toBeGreaterThanOrEqual(5);
    for (const draft of all) {
      const line = draft.why[0]!;
      expect(wordCount(line)).toBeLessThanOrEqual(WHY_MAX_WORDS);
      expect(line.slice(0, -1)).not.toMatch(/[.!?]\s+[A-Z]/);
      const labels = draft.figures.map((figure) => figure.label);
      expect(labels.includes("Buy-more level") && labels.includes("Sell-some level")).toBe(false);
      expect(labels.includes("60-day low") && labels.includes("60-day high")).toBe(false);
    }
    const results = all.find((draft) => draft.kind === "results")!;
    expect(results.why[0]).toBe("NVDA reported yesterday, lowered its guidance, missed on earnings by 7.3% and fell 8.7%.");
  });

  it("an alert proposal carries its level for the card's bar", () => {
    const card = toCard(newProposal("u1", draftFor("NVDA", "e1"), NOW), { price: 120, dayPct: -1, at: null });
    expect(card.level).toEqual({ price: 100, label: "Alert" });
  });

  it("reads back what it stored and refuses anything else", () => {
    const stored = newProposal("u1", draftFor("NVDA", "e1"), NOW);
    expect(readProposal(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    expect(readProposal({ ...stored, version: 2 })).toBeNull();
    expect(readProposal({ ...stored, status: "weird" })).toBeNull();
    expect(readProposal(null)).toBeNull();
  });
});

describe("a holding's filing added risks", () => {
  const change = {
    ticker: "NVDA",
    form: "10-Q" as const,
    accession: "0001045810-26-000075",
    filed: shift(TODAY, -1),
    url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000075/nvda-20260726.htm",
    added: ["Our indebtedness may adversely affect our financial condition and cash flows from operations."],
    dropped: 0,
    base: { form: "10-K" as const, filed: "2026-02-25", url: "https://www.sec.gov/Archives/edgar/data/1045810/x.htm" },
  };
  const priced = { quotes: { NVDA: { price: 150, dayPct: -1.2, at: null } }, series: { NVDA: series(150, { low: 131.2 }) } };

  it("proposes an alert under the price, quoting the new risk as filed, with what it read", () => {
    const draft = only(candidates(inputs({ ...priced, filingChanges: [change] })), "filing_risks");
    expect(draft.title).toBe("Set an alert on NVDA at $131.20");
    expect(wordCount(draft.title)).toBeLessThanOrEqual(TITLE_MAX_WORDS);
    expect(draft.why[0]).toBe("NVDA's 10-Q yesterday adds 1 risk.");
    expect(draft.why[1]).toBe("New: “Our indebtedness may adversely affect our financial condition and cash flows from operations.”");
    for (const line of draft.why) expect(wordCount(line)).toBeLessThanOrEqual(WHY_MAX_WORDS);
    expect(draft.event).toMatchObject({ key: `filing_risks:NVDA:${change.accession}`, refs: ["tm_filing_changes/NVDA"] });
    expect(draft.read.slice(0, 2).map((source) => source.label)).toEqual(["NVDA 10-Q risk factors", "NVDA 10-K risk factors"]);
    expect(draft.figures[0]).toEqual({ label: "Risks added", value: "1" });
    expect(draft.action).toMatchObject({ type: "alert_price", condition: "below", price: 131.2 });
  });

  it("makes nothing for a watched stock, an old filing, a filing that only dropped risks, or without the alerts read", () => {
    const watched = { ...NVDA, position: "watchlist" as const };
    expect(candidates(inputs({ ...priced, stocks: [watched], filingChanges: [change] })).some((draft) => draft.kind === "filing_risks")).toBe(false);
    expect(candidates(inputs({ ...priced, filingChanges: [{ ...change, filed: shift(TODAY, -9) }] })).some((draft) => draft.kind === "filing_risks")).toBe(false);
    expect(candidates(inputs({ ...priced, filingChanges: [{ ...change, added: [], dropped: 2 }] })).some((draft) => draft.kind === "filing_risks")).toBe(false);
    expect(candidates(inputs({ ...priced, alerts: null, filingChanges: [change] })).some((draft) => draft.kind === "filing_risks")).toBe(false);
  });

  it("quotes a long new risk cut at a clause, and leaves out one with no clause that fits", () => {
    const long = { ...change, added: ["We may fail to realize the anticipated benefits of the merger, and any failure to integrate the businesses may hurt us."] };
    const draft = only(candidates(inputs({ ...priced, filingChanges: [long] })), "filing_risks");
    expect(draft.why[1]).toBe("New: “We may fail to realize the anticipated benefits of the merger.”");
    const unbroken = { ...change, added: ["Our results may suffer because of the many different things that could go wrong with the supply of our products."] };
    const plain = only(candidates(inputs({ ...priced, filingChanges: [unbroken] })), "filing_risks");
    expect(plain.why.some((line) => line.startsWith("New:"))).toBe(false);
    for (const line of [...draft.why, ...plain.why]) expect(line.includes("…")).toBe(false);
  });

  it("goes stale once the alert is set", () => {
    const draft = only(candidates(inputs({ ...priced, filingChanges: [change] })), "filing_risks");
    const proposal = newProposal("u1", draft, NOW);
    expect(staleReason(proposal, inputs({ ...priced, alerts: [alert({ price: 131.2 })] }))).toBe("alert_set");
  });
});
