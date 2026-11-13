import { describe, expect, it } from "vitest";

import {
  classifyQuarter,
  compareFull,
  compareQuarter,
  diffHeadings,
  hasChanges,
  headingTokens,
  MATCH_THRESHOLD,
  normaliseHeading,
  similarity,
  unread,
  type RiskRead,
} from "./diff";

/** Real headings, from the filings the threshold was set on (Nov 2026). */
const LLY_2025 = [
  "Pharmaceutical research and development is very costly and highly uncertain; we may not succeed in developing, licensing, or acquiring commercially successful products sufficient in number or value to replace revenues of products that have lost or will lose intellectual property protection or are displaced by competing products or therapies.",
  "We and our products face intense competition, including from multinational pharmaceutical companies, biotechnology companies, and lower-cost generic and biosimilar manufacturers, and such competition could have a material adverse effect on our business.",
  "Pharmaceutical products can develop safety or efficacy concerns, which could have a material adverse effect on our revenues, income, and reputation.",
  "Uneven economic growth or downturns or international trade and other global disruptions, geopolitical tensions, or disputes could adversely affect our business and operating results.",
  "We are party to litigation and investigations related to our products, how we price or commercialize our products, and other aspects of our business, which could adversely affect our business, and we are self-insured for certain liabilities.",
  "Regulatory compliance problems could be damaging to the company.",
];
const LLY_2026 = [
  "Pharmaceutical research and development is very costly and highly uncertain; we may not succeed in developing, licensing, or acquiring commercially successful products sufficient in number or value to replace revenues of products that have lost or will lose intellectual property protection or are displaced by competing products or therapies.",
  "We and our products face intense competition, and such competition could have a material adverse effect on our business.",
  "Pharmaceutical products can develop safety or efficacy concerns, which could have a material adverse effect on our revenues, income, and reputation.",
  "Our global operations subject us to risks, including as related to uneven economic growth or downturns, international trade, and other global disruptions, geopolitical tensions, or disputes.",
  "We are party to litigation and investigations, which could adversely affect our business.",
  "Regulatory compliance problems could be damaging to the company.",
];

function read(form: "10-K" | "10-Q", filed: string, headings: string[], intro: string | null = null, found: boolean | null = true): RiskRead {
  return { filing: { form, accession: `acc-${form}-${filed}`, filed, period: null, url: `https://www.sec.gov/Archives/edgar/data/1/${filed}.htm` }, found, headings, intro };
}

const tenK = (filed: string, headings: string[]) => read("10-K", filed, headings);

describe("normalising headings", () => {
  it("drops case, punctuation, possessives, plurals and boilerplate but keeps numbers", () => {
    expect(headingTokens("The Company's 2029 Convertible Notes could materially and adversely affect our results of operations.")).toEqual(["2029", "convertible", "note"]);
    expect(normaliseHeading("Risks related to Tariffs!")).toBe(normaliseHeading("risk related to tariff"));
    expect(headingTokens("Our 7.00% dividend on $1,250 million")).toEqual(["7.00%", "dividend", "$1250", "million"]);
  });

  it("treats a heading that only changed case or punctuation as the same", () => {
    const diff = diffHeadings(["We depend on a small number of customers."], ["We Depend On A Small Number Of Customers"]);
    expect(diff).toMatchObject({ same: 1, added: [], dropped: [], reworded: [] });
  });

  it("keeps different years apart: a number is part of the risk", () => {
    expect(normaliseHeading("Our 2026 notes mature soon.")).not.toBe(normaliseHeading("Our 2029 notes mature soon."));
  });
});

describe("similarity", () => {
  it("pairs a heading that gained or lost a clause with itself", () => {
    expect(similarity(LLY_2025[1]!, LLY_2026[1]!)).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(similarity(LLY_2025[4]!, LLY_2026[4]!)).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it("keeps the near misses from the real filings under the threshold", () => {
    // SMCI's two climate risks (Aug 2025 → Aug 2026): a new one and a dropped one, not one reworded.
    expect(similarity("Climate change may have a long-term impact on our business.", "Our products may not be viewed as supporting climate change mitigation in the IT sector.")).toBeLessThan(MATCH_THRESHOLD);
    // Two shared words inside a long heading are not enough (ASTS).
    expect(similarity("Our services are highly regulated.", "We are highly dependent on the services of Abel Avellan, our founder, Chairman and Chief Executive Officer.")).toBeLessThan(MATCH_THRESHOLD);
  });

  it("is zero for an empty heading", () => {
    expect(similarity("", "Anything at all here.")).toBe(0);
  });
});

describe("diffing two lists", () => {
  it("classifies LLY's 2026 10-K against 2025 as reworded and same, nothing new", () => {
    const diff = diffHeadings(LLY_2025, LLY_2026);
    expect(diff.added).toEqual([]);
    expect(diff.dropped).toEqual([]);
    expect(diff.same).toBe(3);
    expect(diff.reworded.map((pair) => pair.to)).toEqual([LLY_2026[1], LLY_2026[3], LLY_2026[4]]);
  });

  it("reports added and dropped headings exactly as filed, in filing order", () => {
    const before = ["We depend on a small number of customers.", "Intel Corporation's dominance of the microprocessor market may limit our ability to compete.", "Our stock price is volatile."];
    const after = ["We depend on a small number of customers.", "We may be required to satisfy financial obligations under guarantees and other commercial commitments.", "Our stock price is volatile."];
    expect(diffHeadings(before, after)).toEqual({
      added: ["We may be required to satisfy financial obligations under guarantees and other commercial commitments."],
      dropped: ["Intel Corporation's dominance of the microprocessor market may limit our ability to compete."],
      reworded: [],
      same: 2,
    });
  });

  it("pairs each heading once, best pair first, even when two are close", () => {
    const before = ["Our indebtedness could adversely affect our financial condition and prevent us from fulfilling our obligations."];
    const after = [
      "Our indebtedness could adversely affect our financial condition and prevent us from fulfilling our obligations under the notes.",
      "We may be able to incur substantial indebtedness, which could exacerbate the risks to our financial condition.",
    ];
    const diff = diffHeadings(before, after);
    expect(diff.reworded).toHaveLength(1);
    expect(diff.reworded[0]!.to).toBe(after[0]);
    expect(diff.added).toEqual([after[1]]);
  });

  it("drops nothing for a partial list", () => {
    const diff = diffHeadings(LLY_2025, ["Our recent UK acquisition may expose us to additional risks associated with international operations and integration."], { partial: true });
    expect(diff.dropped).toEqual([]);
    expect(diff.added).toHaveLength(1);
  });

  it("counts a heading listed twice once", () => {
    expect(diffHeadings(["A risk about tariffs on our imports."], ["A risk about tariffs on our imports.", "A risk about tariffs on our imports."])).toMatchObject({ same: 1, added: [] });
  });
});

describe("comparing two 10-Ks", () => {
  const five = (prefix: string) => Array.from({ length: 5 }, (_, index) => `${prefix} risk number ${index + 1} could hurt our results in several ways.`);

  it("marks a side with fewer than five headings unreadable, never as changes", () => {
    const full = tenK("2026-02-04", five("Supply"));
    const thin = tenK("2025-02-05", five("Supply").slice(0, 4));
    expect(compareFull(full, thin)).toMatchObject({ status: "unreadable", reason: "few_headings_base", added: [], dropped: [] });
    expect(compareFull(thin, full)).toMatchObject({ status: "unreadable", reason: "few_headings_new" });
    expect(compareFull(read("10-K", "2026-02-04", [], null, false), full)).toMatchObject({ status: "unreadable", reason: "no_section" });
    expect(compareFull(full, null)).toMatchObject({ status: "unreadable", reason: "no_base", base: null });
  });

  it("compares whole lists and names both filings", () => {
    const comparison = compareFull(tenK("2026-02-12", LLY_2026), tenK("2025-02-19", LLY_2025));
    expect(comparison).toMatchObject({ status: "changes", scope: "full", filing: { form: "10-K", filed: "2026-02-12", headings: 6 }, base: { filed: "2025-02-19", headings: 6 } });
    expect(hasChanges(comparison)).toBe(true);
  });
});

describe("10-Qs", () => {
  const annual = tenK("2026-02-25", [
    "Failure to meet the evolving needs of our industry and markets may adversely impact our financial results.",
    "Competition could adversely impact our market share and financial results.",
    "Commercial arrangements expose us to counterparty risks.",
    "Adverse economic conditions may harm our business.",
    "We are subject to complex laws, rules, regulations, and political and other actions, including restrictions on the export of our products, which may adversely impact our business.",
    "Climate change may have a long-term impact on our business.",
  ]);

  it("reports a 10-Q that says nothing changed as no changes, against its 10-K", () => {
    const quarter = read("10-Q", "2026-10-29", [], "Our material risk factors are disclosed in our Annual Report on Form 10-K. There have been no material changes from the risk factors previously disclosed.");
    expect(classifyQuarter(quarter, 6)).toBe("no_changes");
    expect(compareQuarter(quarter, unread(annual.filing), null)).toMatchObject({ status: "no_changes", base: { form: "10-K", filed: "2026-02-25", headings: null }, added: [] });
  });

  it("reports a 10-Q that only points back to the 10-K as none listed", () => {
    const quarter = read("10-Q", "2026-10-22", [], "Our operations and financial results are subject to various risks and uncertainties, including the factors discussed in Part I, Item 1A, Risk Factors in our Annual Report on Form 10-K.");
    expect(compareQuarter(quarter, annual, null).status).toBe("none_listed");
  });

  it("calls a 10-Q unreadable when it says risks follow but none were read, never no changes", () => {
    const quarter = read("10-Q", "2026-08-26", [], "Except as set forth below, there have been no material changes from the risk factors previously disclosed in our Form 10-K.");
    expect(classifyQuarter(quarter, 6)).toBe("unreadable");
    expect(classifyQuarter(read("10-Q", "2026-08-26", [], "x".repeat(1200)), 6)).toBe("unreadable");
  });

  it("leaves out a smaller company that does not have to list risks", () => {
    const quarter = read("10-Q", "2026-11-10", [], "As a smaller reporting company, we are not required to provide the information required by this Item.");
    expect(compareQuarter(quarter, annual, null)).toMatchObject({ status: "unreadable", reason: "not_required" });
  });

  it("holds a partial 10-Q against the 10-K: only new risks are added, nothing is dropped", () => {
    const quarter = read(
      "10-Q",
      "2026-08-26",
      [
        "Commitments, guarantees, and other commercial arrangements expose us to financial, counterparty and execution risks and may not provide anticipated benefits.",
        "We are subject to complex laws, rules, regulations, and political and other actions, including restrictions on the export of our products, which may adversely impact our business.",
        "Our indebtedness may adversely affect our financial condition and cash flows from operations.",
      ],
      "Other than the risk factors listed below, there have been no material changes from the risk factors previously described under Item 1A of our Annual Report on Form 10-K.",
    );
    const comparison = compareQuarter(quarter, annual, annual);
    expect(comparison).toMatchObject({ status: "changes", scope: "partial", base: { form: "10-K" }, same: 1, dropped: [] });
    expect(comparison.added).toEqual(["Our indebtedness may adversely affect our financial condition and cash flows from operations."]);
    expect(comparison.reworded).toHaveLength(1);
  });

  it("never reads a partial 10-Q against a 10-K it could not read", () => {
    const quarter = read("10-Q", "2026-08-26", ["Our indebtedness may adversely affect our financial condition and cash flows from operations."], "Except as set forth below, no material changes.");
    expect(compareQuarter(quarter, tenK("2026-02-25", ["Only one heading was read from this filing."]), null)).toMatchObject({ status: "unreadable", reason: "few_headings_base" });
    expect(compareQuarter(quarter, null, null).status).toBe("unreadable");
  });

  it("compares a 10-Q that repeats the whole list with the filing before it", () => {
    const previous = read("10-Q", "2026-08-05", annual.headings);
    const quarter = read("10-Q", "2026-11-04", [...annual.headings.slice(0, 5), "Our ability to design new products depends on third-party tools."]);
    expect(classifyQuarter(quarter, 6)).toBe("full");
    const comparison = compareQuarter(quarter, annual, previous);
    expect(comparison).toMatchObject({ status: "changes", scope: "full", base: { form: "10-Q", filed: "2026-08-05" } });
    expect(comparison.added).toEqual(["Our ability to design new products depends on third-party tools."]);
    expect(comparison.dropped).toEqual(["Climate change may have a long-term impact on our business."]);
  });

  it("falls back to the 10-K when the filing before a whole-list 10-Q was partial", () => {
    const previous = read("10-Q", "2026-08-05", annual.headings.slice(0, 2));
    const quarter = read("10-Q", "2026-11-04", annual.headings);
    expect(compareQuarter(quarter, annual, previous)).toMatchObject({ status: "changes", base: { form: "10-K" }, same: 6 });
  });
});

describe("hasChanges", () => {
  it("is false for anything without an added, dropped or reworded risk", () => {
    expect(hasChanges(null)).toBe(false);
    expect(hasChanges(compareFull(tenK("2026-02-12", LLY_2025), tenK("2025-02-19", LLY_2025)))).toBe(false);
  });
});

describe("QA round: negations, repeated risks, reasons", () => {
  it("keeps a negation, so a flipped risk is never the same word for word", () => {
    expect(headingTokens("We may not be able to raise additional funds.")).toContain("not");
    expect(normaliseHeading("We may not be able to raise additional funds.")).not.toBe(normaliseHeading("We may be able to raise additional funds."));
    const diff = diffHeadings(["We may be able to raise additional funds on good terms."], ["We may not be able to raise additional funds on good terms."]);
    expect(diff.same).toBe(0);
    expect(diff.reworded).toHaveLength(1);
  });

  const annual = tenK("2026-02-17", [
    "Our loan platform business depends on a concentrated number of counterparties.",
    "Fluctuations in interest rates could negatively affect the demand for our checking and savings products.",
    "Cyberattacks and other security incidents could harm our business and systems.",
    "We are subject to extensive regulation by our prudential regulators.",
    "Our stock price may be volatile and could decline sharply.",
  ]);
  const insurance = "Inadequate self-insurance accruals or insurance coverage for employee healthcare benefits could have an adverse effect on our business.";
  const stablecoin = "The issuance and operation of SoFiUSD is complex and exposes us to risks related to compliance with regulations.";

  it("says a risk an earlier 10-Q already added is repeated, not new again", () => {
    const q2 = read("10-Q", "2026-08-06", [insurance], "Except as set forth below, no material changes.");
    const q3 = read("10-Q", "2026-11-05", [insurance, stablecoin], "Except as set forth below, no material changes.");
    const comparison = compareQuarter(q3, annual, q2, [q2]);
    expect(comparison).toMatchObject({ status: "changes", scope: "partial", added: [stablecoin], repeated: [insurance] });
    expect(hasChanges(comparison)).toBe(true);
    // An earlier 10-Q from before this 10-K does not count.
    const old = read("10-Q", "2025-11-05", [stablecoin], "Except as set forth below, no material changes.");
    expect(compareQuarter(q3, annual, q2, [q2, old]).added).toEqual([stablecoin]);
    // Without earlier quarters read, both are new against the 10-K.
    expect(compareQuarter(q3, annual, q2).added).toEqual([insurance, stablecoin]);
  });

  it("logs a list it says follows but could not read as missed, not as not required", () => {
    const quarter = read("10-Q", "2026-08-26", [], "Except as set forth below, there have been no material changes from the risk factors in our Form 10-K.");
    expect(compareQuarter(quarter, annual, null)).toMatchObject({ status: "unreadable", reason: "missed_list" });
  });
});
