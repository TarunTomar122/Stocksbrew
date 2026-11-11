import { describe, expect, it } from "vitest";

import {
  NEWS_RULES,
  cleanNewsWatch,
  etInstant,
  evaluateNewsEvent,
  newsKnownDay,
  newsSignals,
  type NewsFacts,
  type NewsStory,
  type NewsToneLabel,
} from "@/lib/agent-events-news";
import { EMPTY_FACTS, describeJob, parseJobDraft, replayJob, triggerLabel, type AgentFacts } from "@/lib/agent-jobs";

/** Weekdays from Nov 2, 2026 for three weeks. */
const SESSIONS = (() => {
  const out: string[] = [];
  for (let i = 0; i < 21; i += 1) {
    const date = new Date(Date.UTC(2026, 10, 2) + i * 86_400_000);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) out.push(date.toISOString().slice(0, 10));
  }
  return out;
})();

let serial = 0;
function story(day: string, patch: Partial<NewsStory> = {}): NewsStory {
  serial += 1;
  return {
    id: `s${serial}`,
    title: `Story number ${serial} about the company`,
    url: `https://example.com/${serial}`,
    source: "Reuters",
    source_kind: "publisher",
    published_at: `${day}T15:00:00.000Z`,
    tickers: ["AAPL"],
    day,
    ...patch,
  };
}

/** `per` stories a session on every session before `until`. */
function steady(per: number, until: string, ticker = "AAPL"): NewsStory[] {
  return SESSIONS.filter((day) => day < until).flatMap((day) => Array.from({ length: per }, () => story(day, { tickers: [ticker] })));
}

function newsFacts(stories: NewsStory[], tones: Record<string, NewsToneLabel> = {}, patch: Partial<NewsFacts> = {}): NewsFacts {
  return { stories, tones, coverage_from: SESSIONS[0], tone_from: "2026-11-01T00:00:00.000Z", sessions: SESSIONS, ...patch };
}

function label(tone: NewsToneLabel["tone"], scoredAt = "2026-11-02T00:00:00.000Z"): NewsToneLabel {
  return { tone, scope: "stock", scored_at: scoredAt };
}

function asFacts(news: NewsFacts): AgentFacts {
  return { ...EMPTY_FACTS, news, available: { ...EMPTY_FACTS.available, news: true } };
}

const DAY = "2026-11-17";
const BEFORE = "2026-11-16";
const scope = { kind: "tickers" as const, tickers: ["AAPL"] };

describe("dates", () => {
  it("counts a story published after the 4 PM close for the next day", () => {
    expect(newsKnownDay("2026-11-16T20:59:00Z")).toBe("2026-11-16"); // 3:59 PM EST
    expect(newsKnownDay("2026-11-16T21:00:00Z")).toBe("2026-11-17"); // 4:00 PM EST
  });

  it("finds the New York instant of the check", () => {
    expect(etInstant("2026-11-17", 17 * 60 + 30)).toBe("2026-11-17T22:30:00.000Z");
    expect(etInstant("2026-07-17", 17 * 60 + 30)).toBe("2026-07-17T21:30:00.000Z");
  });

  it("cleans the watch", () => {
    expect(cleanNewsWatch("negative")).toBe("negative");
    expect(cleanNewsWatch("whatever")).toBe("any");
  });
});

describe("heavier than usual", () => {
  it("fires at three times a normal day and six stories, not below", () => {
    const busy = newsFacts([...steady(2, DAY), ...Array.from({ length: 7 }, () => story(DAY))]);
    const result = evaluateNewsEvent("busy", scope, asFacts(busy), { day: DAY, since: BEFORE, tickers: ["AAPL"] }, 8);
    expect(result.decision).toBe("notify");
    expect(result.findings[0]).toMatchObject({ ticker: "AAPL", kind: "news", stories: 7, normal: 2, headline: "AAPL was in the news much more than usual" });
    expect(result.findings[0].detail).toMatch(/^7 stories since the last check, against about 2 on a normal day\. The biggest: “Story number \d+ about the company” \(Reuters, Nov 17, 10:00 AM ET\)\.$/);
    expect(result.findings[0].url).toMatch(/^https:\/\/example\.com\//);

    const calm = newsFacts([...steady(2, DAY), ...Array.from({ length: 5 }, () => story(DAY))]);
    expect(evaluateNewsEvent("busy", scope, asFacts(calm), { day: DAY, since: BEFORE, tickers: ["AAPL"] }, 8).decision).toBe("nothing");
  });

  it("can't judge 'more than usual' without five whole sessions of headlines", () => {
    const short = newsFacts([...steady(2, DAY), ...Array.from({ length: 9 }, () => story(DAY))], {}, { coverage_from: "2026-11-12" });
    const result = evaluateNewsEvent("busy", scope, asFacts(short), { day: DAY, since: BEFORE, tickers: ["AAPL"] }, 8);
    expect(result.decision).toBe("could_not_check");
    expect(result.summary).toMatch(/^Could not check: a normal day needs 5 sessions/);
  });

  it("leaves out press releases and the same story carried twice", () => {
    const today = [
      ...Array.from({ length: 6 }, () => story(DAY, { source_kind: "press_release" })),
      ...Array.from({ length: 6 }, () => story(DAY, { title: "The same headline - Reuters" })),
    ];
    const signals = newsSignals(newsFacts([...steady(1, DAY), ...today]), { day: DAY, since: BEFORE, tickers: ["AAPL"] });
    expect(signals.signals[0].stories).toBe(1);
  });

  it("fires on the turn only, not again the next day of the same storm", () => {
    const storm = newsFacts([...steady(1, BEFORE), ...Array.from({ length: 8 }, () => story(BEFORE)), ...Array.from({ length: 8 }, () => story(DAY))]);
    expect(evaluateNewsEvent("busy", scope, asFacts(storm), { day: BEFORE, since: "2026-11-13", tickers: ["AAPL"] }, 8).decision).toBe("notify");
    expect(evaluateNewsEvent("busy", scope, asFacts(storm), { day: DAY, since: BEFORE, tickers: ["AAPL"] }, 8).decision).toBe("nothing");
  });

  it("counts both share classes of one company", () => {
    const googl = newsFacts([...steady(1, DAY, "GOOG"), ...Array.from({ length: 8 }, () => story(DAY, { tickers: ["GOOG"] }))]);
    const result = evaluateNewsEvent("busy", { kind: "tickers", tickers: ["GOOGL"] }, asFacts(googl), { day: DAY, since: BEFORE, tickers: ["GOOGL"] }, 8);
    expect(result.decision).toBe("notify");
    expect(result.findings[0].ticker).toBe("GOOGL");
  });
});

describe("clearly negative or positive", () => {
  function toned(count: { negative: number; positive: number; neutral: number }, scoredAt?: string) {
    const stories = [
      ...Array.from({ length: count.negative }, () => story(DAY)),
      ...Array.from({ length: count.positive }, () => story(DAY)),
      ...Array.from({ length: count.neutral }, () => story(DAY)),
    ];
    const tones: Record<string, NewsToneLabel> = {};
    stories.forEach((entry, index) => {
      tones[entry.id] = label(index < count.negative ? "negative" : index < count.negative + count.positive ? "positive" : "neutral", scoredAt);
    });
    return newsFacts([...steady(1, DAY), ...stories], tones);
  }

  it("fires with one figure when most of enough stories lean one way", () => {
    const result = evaluateNewsEvent("negative", scope, asFacts(toned({ negative: 5, positive: 0, neutral: 1 })), { day: DAY, since: BEFORE, tickers: ["AAPL"] }, 8);
    expect(result.decision).toBe("notify");
    expect(result.findings[0]).toMatchObject({ headline: "News about AAPL turned negative", tone: "negative", tone_pct: 83 });
    expect(result.findings[0].detail).toMatch(/^83% of the 6 stories we read for tone since the last check were negative\./);
  });

  it("needs five read stories and a clear side", () => {
    expect(evaluateNewsEvent("negative", scope, asFacts(toned({ negative: 4, positive: 0, neutral: 0 })), { day: DAY, since: BEFORE, tickers: ["AAPL"] }, 8).decision).toBe("nothing");
    expect(evaluateNewsEvent("tone", scope, asFacts(toned({ negative: 4, positive: 2, neutral: 0 })), { day: DAY, since: BEFORE, tickers: ["AAPL"] }, 8).decision).toBe("nothing");
    // A positive watch does not fire on negative news.
    expect(evaluateNewsEvent("positive", scope, asFacts(toned({ negative: 6, positive: 0, neutral: 0 })), { day: DAY, since: BEFORE, tickers: ["AAPL"] }, 8).decision).toBe("nothing");
  });

  it("never uses a tone label written after that day's check", () => {
    const late = toned({ negative: 6, positive: 0, neutral: 0 }, "2026-11-17T23:00:00.000Z");
    const result = evaluateNewsEvent("negative", scope, asFacts(late), { day: DAY, since: BEFORE, tickers: ["AAPL"] }, 8);
    expect(result.decision).toBe("nothing");
    expect(newsSignals(late, { day: "2026-11-18", since: DAY, tickers: ["AAPL"] }).signals[0].read).toBe(0);
  });

  it("can't check tone before we started reading it", () => {
    const early = { ...toned({ negative: 6, positive: 0, neutral: 0 }), tone_from: "2026-11-20T00:00:00.000Z" };
    expect(evaluateNewsEvent("negative", scope, asFacts(early), { day: DAY, since: BEFORE, tickers: ["AAPL"] }, 8).decision).toBe("could_not_check");
  });
});

describe("in the jobs", () => {
  it("validates, describes and labels a news job, and never watches the whole market", () => {
    const parsed = parseJobDraft({ template: "news", scope: { kind: "any" }, trigger: { news: "negative" } });
    expect(parsed.ok && parsed.draft).toMatchObject({ trigger: { type: "event", event: "news", news: "negative" }, scope: { kind: "watchlist" } });
    if (!parsed.ok) return;
    expect(describeJob(parsed.draft)).toBe("Tell me when the news about any of the names you track turns clearly negative.");
    expect(triggerLabel(parsed.draft.trigger)).toBe("News turns negative");
  });

  it("replays without hindsight: a storm on the last day fires only that day", () => {
    const facts = asFacts(newsFacts([...steady(2, DAY), ...Array.from({ length: 9 }, () => story(DAY)), ...Array.from({ length: 30 }, () => story("2026-11-18"))]));
    const replay = replayJob({ trigger: { type: "event", event: "news", news: "busy" }, scope }, facts, { end: DAY, tickers: ["AAPL"], calendar: SESSIONS, weeks: 1 });
    const byDay = Object.fromEntries(replay.runs.map((run) => [run.day, run.decision]));
    expect(byDay[DAY]).toBe("notify");
    expect(byDay[BEFORE]).toBe("nothing");
    // Nothing from Nov 18 leaks into the replay that ends on Nov 17.
    expect(replay.runs.find((run) => run.day === DAY)?.findings[0].stories).toBe(9);
    expect(NEWS_RULES.busyRatio).toBe(3);
  });
});

describe("in the run log", () => {
  it("shows the biggest story as a linked note under the run", async () => {
    const { presentRun } = await import("@/lib/agent-jobs-present");
    const facts = asFacts(newsFacts([...steady(2, DAY), ...Array.from({ length: 9 }, () => story(DAY))]));
    const evaluation = evaluateNewsEvent("busy", scope, facts, { day: DAY, since: BEFORE, tickers: ["AAPL"] }, 8);
    const view = presentRun({ ...evaluation, day: DAY, ran_at: "2026-11-17T22:31:00.000Z" }, { trigger: { type: "event", event: "news", news: "busy" }, scope });
    expect(view.verdict).toBe("look");
    expect(view.headline).toBe("AAPL was in the news much more than usual.");
    expect(view.notes[0]).toMatchObject({ title: "AAPL was in the news much more than usual", source: "Reuters" });
    expect(view.notes[0].url).toMatch(/^https:\/\//);
    expect(view.asOf).toMatch(/^Headlines and their tone · checked Tue Nov 17, 5:31 PM ET$/);
  });
});
