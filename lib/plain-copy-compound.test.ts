import { describe, expect, it } from "vitest";

import { sentenceCase } from "./plain-copy";

describe("sentenceCase hyphen compounds", () => {
  it("keeps a leading known name and lowers the common words after it", () => {
    expect(sentenceCase("Super Micro Fell After DOJ China-Smuggling Probe")).toContain("China-smuggling");
  });
  it("keeps real hyphenated names as written", () => {
    expect(sentenceCase("Take-Two Shares Rise")).toContain("Take-Two");
  });
});
