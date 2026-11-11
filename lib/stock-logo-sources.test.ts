import { describe, expect, it } from "vitest";

import {
  isLogoKey,
  LOGO_VERSION,
  logoFallbackColor,
  logoInitials,
  logoKey,
  logoMonogramSvg,
  logoSrc,
} from "@/lib/stock-logo-sources";

describe("same-origin logos", () => {
  it("joins share-class spellings into one store key", () => {
    expect(logoKey("brk-b")).toBe("BRK.B");
    expect(logoKey("BRK_B")).toBe("BRK.B");
    expect(logoKey(" BRK.B ")).toBe("BRK.B");
    expect(logoKey("")).toBe("");
  });

  it("accepts only keys that can be a document id", () => {
    expect(isLogoKey("BRK.B")).toBe(true);
    expect(isLogoKey("M&M")).toBe(true);
    for (const bad of ["", ".", "A..B", "A.", ".A", "^GSPC", "%41", "A".repeat(16)]) {
      expect(isLogoKey(bad), bad).toBe(false);
    }
  });

  it("builds a versioned URL on our own domain", () => {
    expect(logoSrc("msft")).toBe(`/api/logo/MSFT?v=${LOGO_VERSION}`);
    expect(logoSrc("BRK-B")).toBe(`/api/logo/BRK.B?v=${LOGO_VERSION}`);
    expect(logoSrc("M&M", "IN")).toBe(`/api/logo/M%26M?v=${LOGO_VERSION}&m=IN`);
  });

  it("gives every ticker the same letters and colour every time", () => {
    expect(logoInitials("brk.b")).toBe("BR");
    expect(logoInitials("F")).toBe("F");
    expect(logoInitials("")).toBe("?");
    expect(logoFallbackColor("NVDA")).toBe(logoFallbackColor("nvda"));
    expect(logoFallbackColor("BRK-B")).toBe(logoFallbackColor("BRK.B"));
    expect(logoFallbackColor("NVDA")).toMatch(/^hsl\(\d+ 62% 28%\)$/);
  });

  it("draws a plain square SVG with only safe letters in it", () => {
    const svg = logoMonogramSvg("<script>");
    expect(svg).toContain(">SC</text>");
    expect(svg).not.toContain("<script");
    expect(svg.startsWith("<svg")).toBe(true);
  });
});
