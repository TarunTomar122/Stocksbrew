import { describe, expect, it } from "vitest";

import { clip, findSection, htmlToText, latestFromSubmissions, mdaHighlights, parseFiling, riskHeadings, secTicker } from "./edgar";

const LONG = "This is the body of a risk factor that explains in detail how the risk could hurt the business, its customers and its results over time. ".repeat(3);

const TEN_K = `
<html><head><title>10-K</title></head><body>
<ix:header><ix:hidden>hidden facts 123456</ix:hidden></ix:header>
<div>Table of Contents</div>
<div>Item 1. Business 4</div>
<div>Item 1A. Risk Factors 12</div>
<div>Item 1B. Unresolved Staff Comments 30</div>
<div>Item 7. Management&#8217;s Discussion and Analysis 40</div>
<div>Item 8. Financial Statements 60</div>
<div>Item 1. Business</div>
<p>We design accelerated computing platforms that data centers, gaming PCs and cars use, and we sell them to cloud providers, PC makers and car companies around the world through partners.</p>
<p>See Item 1A. Risk Factors for what could go wrong.</p>
<div>Item 1A. Risk Factors</div>
<p><b>Failure to meet the evolving needs of our industry may adversely impact our financial results.</b></p>
<p>${LONG}</p>
<p><i>We depend on a small number of customers for a large share of our revenue.</i></p>
<p>${LONG}</p>
<div>Item 1B. Unresolved Staff Comments</div>
<p>None.</p>
<div>Item 7. Management&rsquo;s Discussion and Analysis of Financial Condition</div>
<p>This discussion contains forward-looking statements that involve risks and uncertainties, including 2026 targets and the outlook described below.</p>
<p>Revenue for fiscal year 2026 was $215.9 billion, up 65% from a year ago, driven by Data Center revenue of $193.7 billion as cloud providers expanded capacity.</p>
<p>2026 2025 $ 215,938 $ 130,497 65 % 60,922 26,974 13,221 11,123 9,999</p>
<div>Item 8. Financial Statements and Supplementary Data</div>
</body></html>`;

describe("reading a 10-K", () => {
  it("turns HTML into one paragraph per line and drops hidden XBRL", () => {
    const text = htmlToText(TEN_K);
    expect(text).not.toContain("hidden facts");
    expect(text).toContain("Item 7. Management's Discussion and Analysis 40");
    expect(text.split("\n")).toContain("None.");
  });

  it("takes the real section, not the table of contents line or a mention in a sentence", () => {
    const text = htmlToText(TEN_K);
    const risks = findSection(text, /item\s*1a\.?\s*risk\s+factors/i, /item\s*1b\.?\s*unresolved/i);
    expect(risks).toContain("Failure to meet the evolving needs");
    expect(risks).not.toContain("Unresolved Staff Comments");
    expect(risks).not.toContain("accelerated computing");
  });

  it("finds risk headings followed by a body paragraph", () => {
    const read = parseFiling({ form: "10-K", company: "NVIDIA CORP", cik: 1045810, accession: "0001045810-26-000001", filed: "2026-02-25", period: "2026-01-25", url: "https://www.sec.gov/x" }, TEN_K);
    expect(read.risks).toEqual([
      "Failure to meet the evolving needs of our industry may adversely impact our financial results.",
      "We depend on a small number of customers for a large share of our revenue.",
    ]);
    expect(read.business[0]).toMatch(/^We design accelerated computing/);
  });

  it("keeps MD&A passages with numbers and skips boilerplate and flattened tables", () => {
    const read = parseFiling({ form: "10-K", company: "NVIDIA CORP", cik: 1, accession: "a", filed: "2026-02-25", period: null, url: "u" }, TEN_K);
    expect(read.mda).toEqual([
      "Revenue for fiscal year 2026 was $215.9 billion, up 65% from a year ago, driven by Data Center revenue of $193.7 billion as cloud providers expanded capacity.",
    ]);
  });

  it("caps headings and passages", () => {
    expect(riskHeadings(`A heading sentence that is long enough to count as one.\n${LONG}\n`.repeat(40), 5)).toHaveLength(1);
    expect(mdaHighlights(`Revenue grew 10% to $5 billion compared with last year as customers bought more of everything we sell, in every region we serve.\n`.repeat(3))).toHaveLength(1);
    expect(clip("One sentence here. Another sentence that runs on and on.", 30)).toBe("One sentence here.");
  });
});

describe("finding the filings", () => {
  it("picks the newest original 10-K and 10-Q and builds the document URL", () => {
    const latest = latestFromSubmissions(1045810, {
      name: "NVIDIA CORP",
      filings: {
        recent: {
          form: ["8-K", "10-Q", "10-K/A", "10-Q", "10-K"],
          filingDate: ["2026-11-01", "2026-08-27", "2026-04-01", "2026-05-28", "2026-02-25"],
          reportDate: ["", "2026-07-27", "", "2026-04-27", "2026-01-25"],
          accessionNumber: ["1", "0001045810-26-000200", "3", "4", "0001045810-26-000010"],
          primaryDocument: ["a.htm", "nvda-20260727.htm", "c.htm", "d.htm", "nvda-20260125.htm"],
        },
      },
    });
    expect(latest.quarterly).toMatchObject({ form: "10-Q", filed: "2026-08-27", period: "2026-07-27", url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000200/nvda-20260727.htm" });
    expect(latest.annual).toMatchObject({ form: "10-K", filed: "2026-02-25" });
  });

  it("writes share classes the way SEC does", () => {
    expect(secTicker("brk.b")).toBe("BRK-B");
  });
});
