import { describe, expect, it } from "vitest";

import { parseJobDraft } from "@/lib/agent-jobs";

import { basketFullyWatched, parseSubjectKey, recipeById, recipesFor, standingJob, type RecipeSubject } from "./recipes";
import { checkedOverall, historyRows, quietLine, quietSummary, replayView, todayQuietText } from "./view";

const NVDA: RecipeSubject = { kind: "stock", ticker: "NVDA", name: "NVIDIA" };
const BASKET: RecipeSubject = { kind: "basket", id: "abc123", name: "AI capex", tickers: ["NVDA", "AMD"], thesis: true, enabled: true };

const words = (text: string) => text.trim().split(/\s+/).length;

describe("the recipe catalog", () => {
  it("offers four stock recipes, each a draft the form itself would accept", () => {
    const recipes = recipesFor(NVDA);
    expect(recipes.map((recipe) => recipe.id)).toEqual(["report", "risks", "insiders", "move"]);
    for (const recipe of recipes) {
      expect(recipe.draft).not.toBeNull();
      expect(parseJobDraft(recipe.draft, { hidden: [] }).ok).toBe(true);
      expect(recipe.draft!.scope).toEqual({ kind: "tickers", tickers: ["NVDA"] });
    }
  });

  it("keeps every title within 10 words and every line within 15 (owner rule 8)", () => {
    const subjects: RecipeSubject[] = [NVDA, { kind: "fund", id: "berkshire-hathaway", name: "Berkshire Hathaway" }, { kind: "congress", id: "nancy-pelosi", name: "Nancy Pelosi" }, BASKET];
    for (const subject of subjects) {
      for (const recipe of recipesFor(subject)) {
        expect(words(recipe.title)).toBeLessThanOrEqual(10);
        expect(words(recipe.line)).toBeLessThanOrEqual(15);
        expect(recipe.source.length).toBeGreaterThan(0);
      }
    }
  });

  it("only takes a size that is on offer", () => {
    expect(recipeById(NVDA, "move", 8)!.draft!.trigger).toMatchObject({ rule: "moves_pct", pct: 8, reason: true });
    expect(recipeById(NVDA, "move", 42)!.draft!.trigger).toMatchObject({ pct: 5 });
    expect(recipeById(NVDA, "insiders", 1_000_000)!.title).toBe("Insiders buy $1M or more");
    expect(recipeById(NVDA, "nope")).toBeNull();
  });

  it("names its subject in a strict key", () => {
    expect(parseSubjectKey("stock:nvda")).toEqual({ kind: "stock", id: "NVDA" });
    expect(parseSubjectKey("congress:Nancy-Pelosi")).toEqual({ kind: "congress", id: "nancy-pelosi" });
    expect(parseSubjectKey("stock:../x")).toBeNull();
    expect(parseSubjectKey("user:abc")).toBeNull();
  });

  it("treats a watch of another size as the same standing rule, but not another stock", () => {
    const move = recipeById(NVDA, "move", 5)!;
    const three = recipeById(NVDA, "move", 3)!.draft!;
    expect(standingJob(move, [three])).toBe(three);
    const amd = recipeById({ kind: "stock", ticker: "AMD", name: null }, "move", 5)!.draft!;
    expect(standingJob(move, [amd])).toBeNull();
    // A hand-made move watch without the reason, and a plain earnings watch, stand for the recipes too.
    const plain = parseJobDraft({ template: "big-move", scope: { kind: "tickers", tickers: ["NVDA"] }, trigger: { pct: 4 } });
    expect(plain.ok && standingJob(move, [plain.draft])).toBeTruthy();
    const earnings = parseJobDraft({ template: "earnings-ahead", scope: { kind: "tickers", tickers: ["NVDA"] }, trigger: { days_before: 1 } });
    expect(earnings.ok && standingJob(recipeById(NVDA, "report")!, [earnings.draft])).toBeTruthy();
  });

  it("never offers an investor recipe that lost its investor", () => {
    const odd = recipesFor({ kind: "congress", id: "Not A Slug!", name: "Someone" });
    expect(odd.every((recipe) => recipe.draft === null)).toBe(true);
  });

  it("offers a basket its own check and a filing watch, and stops offering once both stand", () => {
    const recipes = recipesFor(BASKET);
    expect(recipes.map((recipe) => recipe.id)).toEqual(["lines", "filings"]);
    expect(recipes[0]!.draft).toBeNull();
    expect(basketFullyWatched(BASKET as Extract<RecipeSubject, { kind: "basket" }>, [])).toBe(false);
    expect(basketFullyWatched(BASKET as Extract<RecipeSubject, { kind: "basket" }>, [recipes[1]!.draft!])).toBe(true);
    expect(basketFullyWatched({ ...(BASKET as Extract<RecipeSubject, { kind: "basket" }>), enabled: false }, [recipes[1]!.draft!])).toBe(false);
  });
});

describe("quiet lines and history", () => {
  const filings = recipeById(NVDA, "risks")!.draft!;

  it("says a quiet run as what it checked", () => {
    expect(quietLine(filings, { decision: "nothing", summary: "Checked, nothing to do." })).toBe("Checked NVDA filings for new risks: nothing new");
    const sec = parseJobDraft({ template: "sec-filing", scope: { kind: "tickers", tickers: ["NVDA"] } });
    expect(sec.ok && quietLine(sec.draft, { decision: "nothing", summary: "" })).toBe("Checked NVDA filings: nothing new");
    expect(quietLine(filings, { decision: "could_not_check", summary: "Could not check: the filing comparisons were not available." })).toBe(
      "Couldn't check: the filing comparisons were not available",
    );
    const fund = recipesFor({ kind: "fund", id: "berkshire-hathaway", name: "Berkshire Hathaway" })[0]!.draft!;
    expect(quietLine(fund, { decision: "nothing", summary: "" })).toBe("Checked Berkshire Hathaway's 13F filings: nothing new");
  });

  it("lists one row per day, newest first, quiet days included", () => {
    const run = (day: string, decision: "notify" | "nothing", ranAt = `${day}T22:00:00Z`) => ({
      id: day,
      job_id: "j",
      uid: "u",
      job_name: "x",
      day,
      ran_at: ranAt,
      decision,
      summary: decision === "notify" ? "AMD's 10-K adds 2 risks." : "Checked, nothing to do.",
      findings: decision === "notify" ? [{ ticker: "NVDA", headline: "NVDA's 10-K adds 2 risks", detail: "", source: "SEC 10-K", url: null, at: day, kind: "filing" as const }] : [],
      checked: [],
    });
    const rows = historyRows([run("2026-11-10", "nothing"), run("2026-11-12", "notify"), run("2026-11-11", "nothing"), run("2026-11-11", "nothing", "2026-11-11T21:00:00Z")], filings, "2026-11-12");
    expect(rows.map((row) => [row.label, row.decision, row.checks])).toEqual([
      ["Today", "notify", 1],
      ["Tuesday – yesterday", "nothing", 2],
    ]);
    expect(rows[1]!.text).toBe("Checked NVDA filings for new risks: nothing new");
    expect(rows[0]!.tickers).toEqual(["NVDA"]);
  });

  it("says today's quiet checks across agents in one line", () => {
    expect(todayQuietText([{ decision: "nothing" }, { decision: "nothing" }, { decision: "nothing" }, { decision: "nothing" }])).toBe("4 agents checked, nothing needs you.");
    expect(todayQuietText([{ decision: "nothing", line: "Checked NVDA filings: nothing new" }])).toBe("Checked NVDA filings: nothing new.");
    expect(todayQuietText([{ decision: "notify" }, { decision: "nothing" }, { decision: "nothing" }])).toBe("2 other agents checked, nothing else needs you.");
    expect(todayQuietText([{ decision: "notify" }])).toBeNull();
    expect(todayQuietText([{ decision: "could_not_check" }, { decision: "nothing" }, { decision: "nothing" }])).toBe("2 agents checked, nothing needs you; 1 couldn't check.");
    expect(todayQuietText([])).toBeNull();
  });
});

describe("a replay for the sheet", () => {
  it("says four quiet weeks in one line", () => {
    expect(quietSummary(["Earnings dates within 3 calendar days of Nov 12: 0", "Next report: NVDA on Nov 17"], 20)).toBe("Next report: NVDA on Nov 17.");
    expect(quietSummary(["Insider filings dated Oct 16 to Nov 12: 772", "Insider filings in NVDA dated Oct 16 to Nov 12: 0", "Buys of $100K or more in NVDA dated Oct 16 to Nov 12: 0"], 20)).toBe(
      "No buys of $100K or more in NVDA in 20 market days.",
    );
    expect(quietSummary(["Jonathan L. Jackson's disclosures dated Oct 16 to Nov 12: 6"], 20)).toBe("Jonathan L. Jackson's disclosures: 6 in 20 market days.");
    expect(quietSummary(["Daily closes for 1 name, latest Nov 12"], 1)).toBe("Nothing to tell in 1 market day.");
  });

  it("adds up what it read across the four weeks and keeps the rest as of the last day", () => {
    const lines = checkedOverall(
      [
        { checked: ["Insider filings dated Nov 12: 78", "Filings in NVDA dated Nov 12: 0", "Names in scope: 1"] },
        { checked: ["Insider filings dated Nov 11: 1,000", "Filings in NVDA dated Nov 11: 1", "Names in scope: 1"] },
      ],
      "Oct 16 to Nov 12",
    );
    expect(lines).toEqual(["Insider filings dated Oct 16 to Nov 12: 1,078", "Filings in NVDA dated Oct 16 to Nov 12: 1", "Names in scope: 1"]);
  });

  it("lists the days it would have spoken, newest first, and keeps the move as the row's figure", () => {
    const view = replayView(
      {
        from: "2026-10-16",
        to: "2026-11-12",
        sessions: 20,
        counts: { notify: 1, nothing: 19, could_not_check: 0 },
        notes: ["This is a replay, not a record.", "Prices are daily closes."],
        runs: [
          {
            day: "2026-11-10",
            decision: "notify",
            summary: "NVDA fell 5.47% in a day.",
            checked: ["Daily closes for 1 name, latest Nov 10"],
            findings: [{ ticker: "NVDA", headline: "NVDA fell 5.47% in a day, about three times a normal day", detail: "Closed at $168.89", source: "", url: "/stock/NVDA", at: "2026-11-10", kind: "move", change_pct: -5.47, close: 168.89 }],
          },
        ],
      },
      "2026-11-12",
    );
    expect(view.span).toBe("Oct 16 to Nov 12");
    expect(view.sent).toEqual([
      { day: "2026-11-10", label: "Tuesday", headline: "NVDA fell, about three times a normal day", detail: null, tickers: ["NVDA"], href: "/stock/NVDA", close: 168.89, change_pct: -5.47 },
    ]);
    expect(view.notes).toEqual(["Prices are daily closes."]);
  });
});
