import { describe, expect, it } from "vitest";
import { appendVaryAccept, hasMarkdownVersion, preferredType } from "./accept";

describe("Accept negotiation", () => {
  it("prefers markdown and respects q values and explicit rejection", () => {
    expect(preferredType("text/markdown")).toBe("text/markdown");
    expect(preferredType("text/html;q=0.8, text/markdown;q=1")).toBe("text/markdown");
    expect(preferredType("text/html;q=0, */*;q=1")).toBe("text/markdown");
    expect(preferredType("application/json")).toBeNull();
  });

  it("preserves existing Vary values", () => {
    const headers = new Headers({ Vary: "RSC" });
    appendVaryAccept(headers);
    appendVaryAccept(headers);
    expect(headers.get("Vary")).toBe("RSC, Accept");
  });

  it("has a Markdown version only for the home page", () => {
    expect(hasMarkdownVersion("/")).toBe(true);
    // ShapBot's Accept ("text/markdown, text/html;q=0.9") on a stock page: the HTML page, not a Markdown 404.
    expect(preferredType("text/markdown, text/html;q=0.9, */*;q=0.8")).toBe("text/markdown");
    expect(hasMarkdownVersion("/stock/NVDA")).toBe(false);
    expect(hasMarkdownVersion("/insiders/NVDA")).toBe(false);
  });
});
