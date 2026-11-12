import { describe, expect, it } from "vitest";

import { shortBuyerName } from "@/lib/buyer-name";

describe("shortBuyerName", () => {
  it("keeps a short name and cuts a long one at a word with …", () => {
    expect(shortBuyerName("Michael Scott Powell")).toBe("Michael Scott Powell");
    expect(shortBuyerName("Nippon Life Insurance Co")).toBe("Nippon Life…");
    expect(shortBuyerName("Berkshire Hathaway Inc.")).toBe("Berkshire Hathaway…");
    expect(shortBuyerName("Supercalifragilisticexpialidocious")).toBe("Supercalifragilistic…");
  });
});
