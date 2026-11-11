import { describe, expect, it } from "vitest";

import { SourceBook } from "./sources";

describe("the source book", () => {
  it("keeps one id for one outside document, and separate ids for different sources on our own page", () => {
    const book = new SourceBook();
    const filing = book.cite({ label: "AMD 10-K", url: "https://www.sec.gov/a.htm", kind: "filing" });
    expect(book.cite({ label: "AMD 10-K, filed Feb 4", url: "https://www.sec.gov/a.htm", kind: "filing" })).toBe(filing);
    const quote = book.cite({ label: "stocksbrew stock page for AMD", url: "/stock/AMD", kind: "ours" });
    const analysts = book.cite({ label: "Analyst ratings for AMD", url: "/stock/AMD", kind: "data" });
    expect(analysts).not.toBe(quote);
    expect(book.all().map((source) => source.id)).toEqual(["S1", "S2", "S3"]);
  });
});
