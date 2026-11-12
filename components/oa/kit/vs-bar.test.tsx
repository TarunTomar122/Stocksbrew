import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { marketKindIcon } from "@/components/markets/market-kind";

import { VsBar, vsText } from "./vs-bar";

(globalThis as { React?: typeof React }).React = React;

describe("VsBar", () => {
  it("prints each figure with a real minus, a plus only when signed, and no sign on zero", () => {
    const one = (n: number) => n.toFixed(1);
    expect(vsText(12.4, one, "%", true)).toBe("+12.4%");
    expect(vsText(-7.8, one, "%", true)).toBe("−7.8%");
    expect(vsText(60, (n) => `${Math.round(n)}`, "%")).toBe("60%");
    expect(vsText(-0.01, one, "%", true)).toBe("0.0%");
  });

  it("names both bars and both figures, and draws nothing when either is missing", () => {
    const html = renderToStaticMarkup(<VsBar value={12.4} versus={12.3} labels={["VOO", "S&P 500"]} format={(n) => n.toFixed(1)} suffix="%" signed />);
    expect(html).toContain('aria-label="VOO +12.4%, S&amp;P 500 +12.3%"');
    expect(renderToStaticMarkup(<VsBar value={null} versus={12.3} labels={["A", "B"]} />)).toBe("");
  });
});

describe("marketKindIcon", () => {
  it("gives each kind of market its own icon", () => {
    expect(marketKindIcon({ class: "index", symbol: "SPX" })).toBe("markets");
    expect(marketKindIcon({ class: "rate", symbol: "US10Y" })).toBe("percent");
    expect(marketKindIcon({ class: "commodity", symbol: "GC" })).toBe("ingot");
    expect(marketKindIcon({ class: "commodity", symbol: "CL" })).toBe("drop");
    expect(marketKindIcon({ class: "index", symbol: "DXY" })).toBe("dollar");
    expect(marketKindIcon({ class: "fx", symbol: "EURUSD" })).toBe("exchange");
    expect(marketKindIcon({ class: "crypto", symbol: "BTC" })).toBe("block");
  });
});
