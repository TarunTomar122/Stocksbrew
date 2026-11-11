import { describe, expect, it } from "vitest";

import { alsoClassesLabel, companyKey, oneRowPerCompany } from "./share-class";

describe("companyKey", () => {
  it("joins share classes of one company", () => {
    expect(companyKey("GOOG")).toBe(companyKey("GOOGL"));
    expect(companyKey("LEN.B")).toBe(companyKey("LEN"));
    expect(companyKey("BRK.A")).toBe(companyKey("BRK.B"));
    expect(companyKey("brk-b")).toBe(companyKey("BRK.B"));
    expect(companyKey("FOX")).toBe(companyKey("FOXA"));
  });

  it("keeps different companies apart", () => {
    expect(companyKey("GOOGL")).not.toBe(companyKey("GOOS"));
    expect(companyKey("LEN")).not.toBe(companyKey("LENZ"));
    expect(companyKey("F")).not.toBe(companyKey("FOXA"));
    expect(companyKey("")).toBe("");
    expect(companyKey(null)).toBe("");
  });
});

describe("oneRowPerCompany", () => {
  const rows = [
    { t: "GOOGL", w: 9 },
    { t: "AAPL", w: 22 },
    { t: "LEN", w: 1 },
    { t: "GOOG", w: 3 },
    { t: null, w: 0 },
    { t: "LEN.B", w: 0.2 },
  ];

  it("keeps the first class of each company, in order, and names the rest", () => {
    const { rows: kept, also } = oneRowPerCompany(rows, (row) => row.t);
    expect(kept.map((row) => row.t)).toEqual(["GOOGL", "AAPL", "LEN", null]);
    expect(alsoClassesLabel(also, "GOOGL")).toBe("also GOOG");
    expect(alsoClassesLabel(also, "LEN")).toBe("also LEN.B");
    expect(alsoClassesLabel(also, "AAPL")).toBeNull();
  });

  it("does not touch the rows it was given", () => {
    const copy = rows.map((row) => ({ ...row }));
    oneRowPerCompany(rows, (row) => row.t);
    expect(rows).toEqual(copy);
  });

  it("keeps a repeated identical ticker (not a share class)", () => {
    const { rows: kept } = oneRowPerCompany([{ t: "MSFT" }, { t: "MSFT" }], (row) => row.t);
    expect(kept).toHaveLength(2);
  });

  it("lists several folded classes in one label", () => {
    const { also } = oneRowPerCompany([{ t: "LSXMK" }, { t: "LSXMA" }, { t: "LSXMB" }], (row) => row.t);
    expect(alsoClassesLabel(also, "LSXMK")).toBe("also LSXMA and LSXMB");
  });
});
