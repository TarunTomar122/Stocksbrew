import { describe, expect, it } from "vitest";
import { appendVaryAccept, preferredType } from "./accept";

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
});
