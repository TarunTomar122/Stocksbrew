import { describe, expect, it } from "vitest";

import { topicOptions } from "./lines";
import { entityOf, ownWords, topicChips, topicList, topicOf, topicWords } from "./topics";
import FIXTURE from "./topics.fixture.json";

/** 200 real risk headings from tm_filing_changes (Nov 2026), read once and kept as a fixture. */
const HEADINGS = FIXTURE as Array<{ company: string; heading: string }>;

describe("topic chips for risk headings", () => {
  it("puts most real headings in a category", () => {
    const own = HEADINGS.filter((row) => topicOf(row.heading, topicOptions(row.company)).id === "own_words").length;
    const share = (HEADINGS.length - own) / HEADINGS.length;
    // 86% on the day it was measured; the rest are named by their own words.
    expect(HEADINGS).toHaveLength(200);
    expect(share).toBeGreaterThanOrEqual(0.82);
  });

  it("keeps every chip to one to three words", () => {
    for (const row of HEADINGS) {
      const label = topicOf(row.heading, topicOptions(row.company)).label;
      expect(label.split(/\s+/).length, label).toBeLessThanOrEqual(4);
      expect(label.length).toBeGreaterThan(1);
    }
  });

  it("reads SMR's 10-K the way a person would", () => {
    const options = topicOptions("NuScale Power Corp");
    expect(topicOf("The PMA with ENTRA1 may result in significant cash outlays in the near term without guaranteeing revenue generating activities.", options).label).toBe("ENTRA1 deal");
    expect(topicOf("Changes in U.S. trade policy, including the imposition of tariffs and the resulting consequences, may have a material adverse impact on our business and results of operations.", options).label).toBe("Tariffs & trade");
    expect(topicOf("We do not expect to pay any cash dividends in the foreseeable future.", options).label).toBe("Dividends");
    expect(topicOf("Our SDA applications may not be approved, and any rework necessary to address NRC concerns could significantly delay the commercialization of our products.", options).label).toBe("SDA approval");
    const weakness = topicOf("We have identified a material weakness in our internal control over financial reporting.", options);
    expect(weakness).toMatchObject({ label: "Material weakness", serious: true });
  });

  it("marks the serious ones and puts them first", () => {
    const chips = topicChips([
      "We do not expect to pay any cash dividends in the foreseeable future.",
      "There can be no assurance that we will be able to comply with the continued listing standards of the NYSE.",
      "The restatement of our previously issued financial statements has resulted in unanticipated costs.",
    ]);
    expect(chips.map((chip) => [chip.label, chip.serious])).toEqual([
      ["Delisting", true],
      ["Restatement", true],
      ["Dividends", false],
    ]);
    // "Litigation and investigations" in general is not a government investigation.
    expect(topicOf("We are party to litigation and investigations, which could adversely affect our business.").serious).toBe(false);
  });

  it("names a deal by its counterparty, never by a defined term or the filer itself", () => {
    expect(entityOf("Our proposed transaction with Ligado may not be consummated.")).toBe("Ligado");
    expect(entityOf("Our ability to complete the acquisition of ZT Systems is subject to closing conditions.", topicOptions())).toBe("ZT Systems");
    expect(entityOf("If the conditions to the Merger are not satisfied or waived, the Merger will not occur.", topicOptions())).toBeNull();
    expect(entityOf("We may fail to realize the benefits of the merger with Coterra.", topicOptions("Devon Energy Corp"))).toBe("Coterra");
    expect(entityOf("Devon may fail to realize the benefits of the merger.", topicOptions("Devon Energy Corp"))).toBeNull();
  });

  it("falls back to the heading's own words, never invented ones", () => {
    expect(ownWords("Investors' ability to make transactions in our securities.")).toBe("Investors' ability");
    expect(ownWords("Drug development is time consuming, expensive and risky.")).toBe("Drug development");
    const topic = topicOf("Contingent liabilities could harm fund performance.");
    expect(topic).toMatchObject({ id: "own_words", label: "Contingent liabilities" });
  });

  it("joins several headings with one label into one chip", () => {
    const chips = topicChips([
      "Intel Corporation's dominance of the microprocessor market may limit our ability to compete.",
      "Nvidia's dominance in the graphics processing unit market may limit our ability to compete.",
    ]);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ label: "Competition", headings: [expect.stringMatching(/^Intel/), expect.stringMatching(/^Nvidia/)] });
  });

  it("says topics inside a sentence in lower case, keeping names and acronyms", () => {
    expect(topicWords("Tariffs & trade")).toBe("tariffs & trade");
    expect(topicWords("AI")).toBe("AI");
    expect(topicWords("ENTRA1 deal")).toBe("ENTRA1 deal");
    expect(topicList(["Changes in tariffs could hurt us.", "Our indebtedness could hurt us."])).toEqual(["tariffs & trade", "debt"]);
  });
});

describe("the serious tier stays for what happened", () => {
  it("does not flag boilerplate, what-ifs or fixed problems", () => {
    for (const heading of [
      "Our Amended and Restated Certificate of Incorporation contains anti-takeover provisions.",
      "If we fail to maintain effective internal control over financial reporting, we may identify material weaknesses.",
      "Our ability to continue as a leader in our markets depends on innovation.",
      "We may become subject to government investigations relating to our products.",
      "We have previously identified material weaknesses which have been remediated.",
      "Changes to stock exchange listing standards regarding board diversity could increase our costs.",
    ]) {
      expect(topicOf(heading).serious, heading).toBe(false);
    }
  });

  it("flags what happened", () => {
    expect(topicOf("There is substantial doubt about our ability to continue as a going concern.")).toMatchObject({ label: "Going concern", serious: true });
    expect(topicOf("We have identified a material weakness in our internal control over financial reporting.")).toMatchObject({ label: "Material weakness", serious: true });
    expect(topicOf("The restatement of our previously issued financial statements has resulted in unanticipated costs.").serious).toBe(true);
  });

  it("keeps a chip serious when a serious heading joins it later", () => {
    const chips = topicChips(["We are subject to the Department of Justice investigation of our sales practices.", "The SEC investigation into our accounting could result in penalties."]);
    expect(chips).toHaveLength(1);
    expect(chips[0]!.serious).toBe(true);
  });

  it("does not misfile common words", () => {
    expect(topicOf("There is no guarantee that our products will achieve market acceptance.").id).not.toBe("debt");
    expect(topicOf("Price wars in our markets could reduce our margins.").id).not.toBe("geopolitics");
    expect(topicOf("Our acquisition of U.S. Steel may not close.", topicOptions()).label).not.toMatch(/^U\.S/);
    expect(topicOf("We are dependent on a single customer for most of our revenue.").id).toBe("customers");
  });
});
