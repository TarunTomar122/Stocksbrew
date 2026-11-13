import { describe, expect, it } from "vitest";

import { clip, filingsFromColumns, findSection, htmlBlocks, htmlToText, isRiskHeading, latestFromSubmissions, mdaHighlights, olderPages, parseFiling, readRiskList, riskHeadings, riskHeadingsFromBlocks, secTicker } from "./edgar";

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

describe("reading risk headings from the filer's formatting", () => {
  // Workiva's layout (Apple): a bold group label, a bold-italic heading, plain body text. The style attribute holds
  // single quotes inside double ones.
  const WORKIVA = `
<div><span style="font-weight:700">Item 1A. Risk Factors</span></div>
<div><span style="font-family:'Helvetica',sans-serif;font-weight:400">The Company's business can be affected by a number of factors, whether currently known or unknown.</span></div>
<div><span style="font-family:'Helvetica',sans-serif;font-weight:700">Macroeconomic and Industry Risks</span></div>
<div><span style="font-family:'Helvetica',sans-serif;font-style:italic;font-weight:700">The Company&#8217;s operations and performance depend significantly on global and regional economic conditions.</span></div>
<div><span style="font-family:'Helvetica',sans-serif;font-weight:400">${LONG}</span></div>
<div><span style="font-weight:700">Legal and Regulatory Risks Related to Our Business</span></div>
<p style="margin:0"><span style="font-weight:bold">If our reputation or our brands are damaged, our business and results of operations may be harmed</span><span>. ${LONG}</span></p>
<p><b><i>We depend on a few large customers for most of our revenue.</i></b> ${LONG}</p>
<div><span style="font-weight:700">Item 1B. Unresolved Staff Comments</span></div>
<p>None.</p>`;

  it("marks each block with how much of it is emphasised", () => {
    const blocks = htmlBlocks(WORKIVA);
    const heading = blocks.find((block) => block.text.startsWith("The Company's operations"));
    expect(heading?.emphasis).toBe(1);
    expect(blocks.find((block) => block.text.startsWith("This is the body"))?.emphasis).toBe(0);
    expect(blocks.find((block) => block.text.startsWith("We depend on a few"))?.lead).toBe("We depend on a few large customers for most of our revenue.");
  });

  it("takes headings, not group labels, body text or the preamble", () => {
    expect(readRiskList("10-K", WORKIVA)).toEqual({
      found: true,
      headings: [
        "The Company's operations and performance depend significantly on global and regional economic conditions.",
        "If our reputation or our brands are damaged, our business and results of operations may be harmed.",
        "We depend on a few large customers for most of our revenue.",
      ],
      intro: "The Company's business can be affected by a number of factors, whether currently known or unknown. Macroeconomic and Industry Risks",
      method: "emphasis",
    });
  });

  it("reads a bold heading broken over two lines as one", () => {
    const html = `<p>Item 1A. Risk Factors</p><p><b>Our international operations expose us<br>to political and economic risks.</b></p><p>${LONG}</p><p>Item 1B. Unresolved Staff Comments</p>`;
    expect(readRiskList("10-K", html).headings).toEqual(["Our international operations expose us to political and economic risks."]);
  });

  it("says when a filing has no Item 1A, and keeps a 10-Q's no-changes line", () => {
    expect(readRiskList("10-K", "<p>Nothing here.</p>")).toMatchObject({ found: false, headings: [], method: "none" });
    const quarter = readRiskList(
      "10-Q",
      `<p>Item 1A. Risk Factors</p><p>There have been no material changes from the risk factors previously disclosed in our Annual Report on Form 10-K.</p><p>Item 2. Unregistered Sales of Equity Securities</p>`,
    );
    expect(quarter).toMatchObject({ found: true, headings: [] });
    expect(quarter.intro).toMatch(/no material changes/);
  });

  it("skips headings that are only a group label or a pointer elsewhere", () => {
    expect(isRiskHeading("Risks Related to Our Business and Industry")).toBe(false);
    expect(isRiskHeading("Legal and Regulatory Risks Related to Our Business")).toBe(false);
    expect(isRiskHeading("The following risk factors should be considered in addition to the other information in this report.")).toBe(false);
    expect(isRiskHeading("Climate change may have a long-term impact on our business.")).toBe(true);
    expect(isRiskHeading("There have been no material changes from the risk factors previously disclosed in our Annual Report on Form 10-K.")).toBe(false);
    expect(isRiskHeading("Investors should carefully consider the risks described in our Annual Report on Form 10-K.")).toBe(false);
    expect(isRiskHeading("Risks Related to the Pending Acquisition of Acme Corp.")).toBe(false);
    expect(riskHeadingsFromBlocks([{ text: "Short.", emphasis: 1, lead: "Short." }])).toEqual([]);
  });
});

describe("listing filings", () => {
  it("lists every original 10-K and 10-Q with its document URL", () => {
    const list = filingsFromColumns(19617, "JPMORGAN CHASE & CO", {
      form: ["424B2", "10-Q", "10-K/A", "10-K"],
      filingDate: ["2026-11-10", "2026-11-03", "2026-05-01", "2026-02-13"],
      reportDate: ["", "2026-09-30", "", "2025-12-31"],
      accessionNumber: ["a", "0001628280-26-069523", "c", "0001628280-26-008131"],
      primaryDocument: ["x.htm", "jpm-20260930.htm", "y.htm", "jpm-20251231.htm"],
    });
    expect(list.map((filing) => `${filing.form} ${filing.filed}`)).toEqual(["10-Q 2026-11-03", "10-K 2026-02-13"]);
    expect(list[1]!.url).toBe("https://www.sec.gov/Archives/edgar/data/19617/000162828026008131/jpm-20251231.htm");
  });

  it("picks the older submissions pages that hold the 10-K a year before", () => {
    const files = [
      { name: "CIK0000019617-submissions-001.json", filingFrom: "2025-10-10", filingTo: "2025-11-10" },
      { name: "CIK0000019617-submissions-007.json", filingFrom: "2025-03-14", filingTo: "2025-04-15" },
      { name: "CIK0000019617-submissions-008.json", filingFrom: "2025-02-11", filingTo: "2025-03-12" },
      { name: "CIK0000019617-submissions-009.json", filingFrom: "2025-01-02", filingTo: "2025-02-09" },
      { name: "../../etc/passwd", filingFrom: "2025-02-11", filingTo: "2025-03-12" },
    ];
    expect(olderPages(files, "2026-02-13", 2)).toEqual(["CIK0000019617-submissions-008.json", "CIK0000019617-submissions-009.json"]);
    expect(olderPages(files, "not a day", 2)).toEqual([]);
  });
});
