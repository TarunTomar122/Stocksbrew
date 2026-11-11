import { describe, expect, it, vi } from "vitest";

import type { StepLoader } from "./gather";
import { shortHeadline } from "./format";
import { runResearch, type RunDeps } from "./run";
import type { ResearchBody, ResearchEvent, ResearchReport } from "./types";
import type { Writer } from "./write";

const NOW = new Date("2026-11-10T15:30:12Z");

const brief: StepLoader = async (ctx) => {
  const source = ctx.book.cite({ label: "NVDA stock page", url: "/stock/NVDA", kind: "ours", as_of: "2026-11-10" });
  ctx.charts.stats.push({ label: "Market value", value: "$4.40T", sub: null, tone: null });
  ctx.charts.stats.push({ label: "Price", value: "$181.20", sub: null, tone: null });
  ctx.dates.add("2026-11-19");
  return { status: "done", detail: "Last price $181.20", facts: { source, quote: { price: 181.2, market_cap: 4.4e12, next_earnings: { date: "2026-11-19" } } } };
};

const financials: StepLoader = async (ctx) => {
  const source = ctx.book.cite({ label: "Financials", url: "https://stockanalysis.com/stocks/nvda/financials/", kind: "data" });
  return { status: "done", detail: "5 fiscal years", facts: { source, history: [{ period: "TTM", revenue: 302970000000, operating_margin_pct: 65.2 }] } };
};

const empty: StepLoader = async () => ({ status: "empty", detail: "Nothing on file.", facts: null, missing: ["We found no news stories about this company in the last 30 days."] });
const broken: StepLoader = async () => {
  throw new Error("store down");
};

function body(patch: Partial<ResearchBody> = {}): ResearchBody {
  return {
    headline: "Revenue reached $303 billion over the last year [S2].",
    summary: ["Revenue reached $303 billion [S2].", "The operating margin is 65.2% [S2].", "It reports on Nov 19 [S1]."],
    business: ["It sells accelerated computing to data centers [S1]."],
    drivers: ["Shares jumped 40% on rumours [S1]."],
    bull: [{ title: "Margins", text: "The operating margin is 65.2% [S2]." }],
    bear: [{ title: "Concentration", text: "A few customers buy most of it [S9]." }],
    valuation: [],
    numbers: [],
    ownership: [],
    risks: [],
    change: [],
    watch: [{ date: "2026-11-19", text: "Third-quarter results [S1]." }],
    ...patch,
  };
}

function harness(overrides: Partial<RunDeps> = {}) {
  const saved: ResearchReport[] = [];
  const events: ResearchEvent[] = [];
  const consume = vi.fn(async () => ({ allowed: true }));
  const write = vi.fn<Writer>(async () => ({ body: body(), via: "anthropic", model: "claude-haiku-5-5", input_tokens: 20000, output_tokens: 5000 }));
  const deps: RunDeps = {
    loaders: { brief, financials, news: empty, social: broken },
    write,
    save: async (report) => {
      saved.push(JSON.parse(JSON.stringify(report)) as ResearchReport);
    },
    consume,
    now: () => NOW,
    ...overrides,
  };
  return { deps, saved, events, consume, write, emit: (event: ResearchEvent) => events.push(event) };
}

const INPUT = { uid: "u1", isPro: false, ticker: "NVDA", name: "NVIDIA" };

describe("a research run", () => {
  it("reads every step, writes once, checks the figures, saves, then counts", async () => {
    const h = harness();
    const report = await runResearch(INPUT, h.deps, h.emit);

    expect(report.status).toBe("ready");
    expect(report.key).toBe("20261110T153012Z");
    expect(h.write).toHaveBeenCalledTimes(1);
    const input = h.write.mock.calls[0]![0];
    expect(input.sources.map((source) => source.id)).toEqual(["S1", "S2"]);
    expect(Object.keys(input.facts).sort()).toEqual(["brief", "financials"]);

    // The invented "40%" and the citation to a source that does not exist are gone.
    expect(report.body!.drivers).toEqual([]);
    expect(report.body!.bear).toEqual([{ title: "Concentration", text: "A few customers buy most of it." }]);
    expect(report.audit!.removed).toEqual(["Shares jumped 40% on rumours [S1]."]);
    expect(report.audit!.citations_dropped).toBe(1);
    expect(report.body!.watch[0]!.date).toBe("2026-11-19");

    // A step that throws is marked failed and named in the gaps; the run goes on.
    expect(report.steps.find((step) => step.id === "social")).toMatchObject({ status: "failed" });
    expect(report.steps.find((step) => step.id === "annual")).toMatchObject({ status: "empty", detail: "Not available here." });
    expect(report.missing).toContain("We found no news stories about this company in the last 30 days.");
    expect(report.missing.some((line) => /Reddit and policy posts/.test(line))).toBe(true);

    // Stats read in a fixed order whatever order the steps finished in.
    expect(report.charts.stats.map((stat) => stat.label)).toEqual(["Price", "Market value"]);

    expect(report.usage).toMatchObject({ input_tokens: 20000, output_tokens: 5000, cost_usd: 0.0045 });
    expect(h.saved[0]!.status).toBe("running");
    expect(h.saved[h.saved.length - 1]!.status).toBe("ready");
    expect(h.consume).toHaveBeenCalledWith("20261110T153012Z");

    expect(h.events[0]).toMatchObject({ type: "start", key: "20261110T153012Z" });
    expect(h.events[h.events.length - 1]).toEqual({ type: "done", key: "20261110T153012Z", href: "/stock/NVDA/research/20261110T153012Z", removed: 1 });
    const writeSteps = h.events.filter((event) => event.type === "step" && event.step.id === "write").map((event) => (event as { step: { status: string } }).step.status);
    expect(writeSteps).toEqual(["running", "done"]);
  });

  it("saves a failed run and does not count it when the writer fails", async () => {
    const h = harness({ write: async () => Promise.reject(new Error("rate limited")) });
    const report = await runResearch(INPUT, h.deps, h.emit);
    expect(report.status).toBe("failed");
    expect(report.error).toBe("write_failed");
    expect(h.saved[h.saved.length - 1]!.status).toBe("failed");
    expect(h.consume).not.toHaveBeenCalled();
    expect(h.events[h.events.length - 1]).toMatchObject({ type: "error", code: "write_failed" });
  });

  it("refuses to write from almost nothing", async () => {
    const h = harness({ loaders: { news: empty, social: broken } });
    const report = await runResearch(INPUT, h.deps, h.emit);
    expect(report.error).toBe("no_evidence");
    expect(h.write).not.toHaveBeenCalled();
    expect(h.consume).not.toHaveBeenCalled();
  });

  it("does not save a draft the check emptied", async () => {
    const bare = body({ headline: "Up 999% [S1].", summary: ["Up 999% [S1]."], business: [], drivers: [], bull: [], bear: [], watch: [] });
    const h = harness({ write: async () => ({ body: bare, via: "anthropic", model: "claude-haiku-5-5", input_tokens: 1, output_tokens: 1 }) });
    const report = await runResearch(INPUT, h.deps, h.emit);
    expect(report.status).toBe("failed");
    expect(h.consume).not.toHaveBeenCalled();
  });

  it("stops a step that hangs and carries on", async () => {
    const hang: StepLoader = () => new Promise(() => undefined);
    const h = harness({ loaders: { brief, financials, peers: hang }, stepTimeoutMs: 20 });
    const report = await runResearch(INPUT, h.deps, h.emit);
    expect(report.status).toBe("ready");
    expect(report.steps.find((step) => step.id === "peers")).toMatchObject({ status: "failed" });
  });

  it("tells the person when it cannot even start, and counts nothing", async () => {
    const h = harness({ save: async () => Promise.reject(new Error("store down")) });
    const report = await runResearch(INPUT, h.deps, h.emit);
    expect(report.status).toBe("failed");
    expect(h.events).toEqual([{ type: "error", code: "save_failed", message: expect.any(String) }]);
    expect(h.write).not.toHaveBeenCalled();
    expect(h.consume).not.toHaveBeenCalled();
  });

  it("retries the last save, so a store hiccup does not leave the report still being written", async () => {
    const saved: string[] = [];
    let calls = 0;
    const h = harness({
      saveRetryMs: [1, 1],
      save: async (report) => {
        calls += 1;
        // The start save and the evidence save pass; the first try of the final save fails once.
        if (calls === 3) throw new Error("LocalDB write failed (502)");
        saved.push(report.status);
      },
    });
    const report = await runResearch(INPUT, h.deps, h.emit);
    expect(report.status).toBe("ready");
    expect(saved[saved.length - 1]).toBe("ready");
    expect(h.consume).toHaveBeenCalledTimes(1);
  });

  it("says the data could not be reached when most steps failed, not that the company has nothing", async () => {
    const h = harness({ loaders: { brief: broken, financials: broken, earnings: broken, news: empty } });
    const report = await runResearch(INPUT, h.deps, h.emit);
    expect(report.error).toBe("sources_down");
    expect(h.events[h.events.length - 1]).toMatchObject({ type: "error", code: "sources_down" });
    expect(h.consume).not.toHaveBeenCalled();
  });

  it("keeps the headline to one idea and drops watch dates already past", async () => {
    const long = body({
      headline: "Revenue reached $303 billion over the last year, yet the stock trades well above its peers on every measure we hold here today [S2].",
      watch: [
        { date: "2026-11-19", text: "Third-quarter results [S1]." },
        { date: "2026-11-01", text: "The October filing [S1]." },
      ],
    });
    const h = harness({ write: async () => ({ body: long, via: "anthropic", model: "claude-haiku-5-5", input_tokens: 1, output_tokens: 1 }) });
    h.deps.loaders.brief = async (ctx) => {
      const out = await brief(ctx);
      ctx.dates.add("2026-11-01");
      return out;
    };
    const report = await runResearch(INPUT, h.deps, h.emit);
    expect(report.body!.headline).toBe("Revenue reached $303 billion over the last year.");
    expect(report.body!.watch.map((item) => item.date)).toEqual(["2026-11-19", null]);
  });
});

describe("shortHeadline", () => {
  it("leaves a short headline alone", () => {
    expect(shortHeadline("Costco's sales are growing faster than its peers, but its valuation is far above them.")).toBe(
      "Costco's sales are growing faster than its peers, but its valuation is far above them.",
    );
  });

  it("keeps the first clause of a two-idea headline when it stands as a sentence", () => {
    expect(
      shortHeadline("AMD's data center revenue rose 97% in the latest quarter, yet the stock sits 20.6% below its 52-week high and trades at a forward P/E well above its peers."),
    ).toBe("AMD's data center revenue rose 97% in the latest quarter.");
  });

  it("never cuts mid-clause when no clean break exists", () => {
    const text = "One very long sentence that keeps going without any of the joins we look for and so cannot be cut cleanly anywhere at all in it.";
    expect(shortHeadline(text)).toBe(text);
  });
});
