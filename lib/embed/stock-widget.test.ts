import { describe, expect, it } from "vitest";

import {
  WIDGET_ORIGIN,
  escapeHtml,
  parseEmbedPath,
  renderStockWidget,
  renderWidgetNotFound,
  sparkPath,
  widgetPath,
  widgetPct,
  widgetReason,
  widgetSnippet,
  widgetSymbol,
  type WidgetStock,
} from "@/lib/embed/stock-widget";

const NVDA: WidgetStock = {
  symbol: "NVDA",
  name: "NVIDIA",
  price: "$188.42",
  dayPct: 2.34,
  dayLabel: "today",
  call: "Add",
  reason: "Data-center orders still outrun supply.",
  spark: [170, 175, 172, 181, 188.42],
  sparkLabel: "3 months",
  sparkPct: 10.8,
  logo: "/api/logo/NVDA?v=2",
};

describe("widget addresses", () => {
  it("reads a ticker and an optional theme segment", () => {
    expect(parseEmbedPath(["NVDA"])).toEqual({ symbol: "NVDA", theme: "light" });
    expect(parseEmbedPath(["brk.b", "dark"])).toEqual({ symbol: "BRK.B", theme: "dark" });
    expect(parseEmbedPath(["nvda", "LIGHT"])).toEqual({ symbol: "NVDA", theme: "light" });
    expect(parseEmbedPath(["NVDA", "blue"])).toBeNull();
    expect(parseEmbedPath(["NVDA", "dark", "x"])).toBeNull();
    expect(parseEmbedPath([])).toBeNull();
    expect(parseEmbedPath(["<script>"])).toBeNull();
    expect(parseEmbedPath(["%E0%A4%A"])).toBeNull();
    expect(widgetSymbol("A".repeat(17))).toBeNull();
  });

  it("puts the theme in the path, light without a segment", () => {
    expect(widgetPath("NVDA")).toBe("/embed/stock/NVDA");
    expect(widgetPath("NVDA", "dark")).toBe("/embed/stock/NVDA/dark");
  });
});

describe("widgetSnippet", () => {
  it("carries a plain link to the stock page outside the iframe", () => {
    const code = widgetSnippet({ symbol: "nvda" });
    expect(code).toContain(`<iframe src="${WIDGET_ORIGIN}/embed/stock/NVDA" width="360" height="`);
    expect(code).toContain('loading="lazy"');
    expect(code).toContain('title="NVDA stock price and our call"');
    const [iframe, link] = code.split("\n");
    expect(iframe).toMatch(/<\/iframe>$/);
    expect(link).toContain(`<a href="${WIDGET_ORIGIN}/stock/NVDA">NVDA stock price and forecast</a> by stocksbrew`);
    // A followed link: no nofollow, no target that some editors strip along with the anchor.
    expect(link).not.toMatch(/nofollow|ugc|sponsored/);
  });

  it("follows the theme and size", () => {
    const code = widgetSnippet({ symbol: "AAPL", theme: "dark", size: "wide" });
    expect(code).toContain("/embed/stock/AAPL/dark");
    expect(code).toContain('style="border:0;width:100%"');
    expect(code).not.toContain('width="100%"');
    expect(widgetSnippet({ symbol: "AAPL", size: "small" })).toContain('width="300"');
  });

  it("always points at the production site and never at a bad ticker", () => {
    expect(widgetSnippet({ symbol: "MSFT", origin: "http://localhost:8000/" })).toContain('src="http://localhost:8000/embed/stock/MSFT"');
    expect(widgetSnippet({ symbol: '"><script>' })).toContain("/embed/stock/NVDA");
    expect(widgetSnippet({ symbol: "MSFT", link: false })).not.toContain("<a ");
  });
});

describe("renderStockWidget", () => {
  it("draws the card with our call in the site's words", () => {
    const html = renderStockWidget(NVDA, "light");
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain(`<link rel="canonical" href="${WIDGET_ORIGIN}/stock/NVDA">`);
    expect(html).toContain('target="_blank" rel="noopener"');
    expect(html).toContain(`href="${WIDGET_ORIGIN}/stock/NVDA?ref=widget"`);
    expect(html).toContain(">Buy more<");
    expect(html).toContain("$188.42");
    expect(html).toContain("+2.3%");
    expect(html).toContain("+10.8% in 3 months");
    expect(html).not.toContain("<script");
    expect(html).toContain("--bg:#fffdf9");
    expect(renderStockWidget(NVDA, "dark")).toContain("--bg:#1f1b16");
    // One fixed scheme would make the browser paint the frame's canvas opaque on a page of the other scheme.
    expect(html).toContain("color-scheme:light dark");
    expect(renderStockWidget(NVDA, "dark")).toContain("color-scheme:light dark");
  });

  it("says Keep and Sell some, never Hold or Trim", () => {
    expect(renderStockWidget({ ...NVDA, call: "Hold" }, "light")).toContain(">Keep<");
    const trim = renderStockWidget({ ...NVDA, call: "Trim" }, "light");
    expect(trim).toContain(">Sell some<");
    expect(trim).not.toMatch(/>(Hold|Trim|Add)</);
  });

  it("leaves out what it does not have", () => {
    const bare = renderStockWidget({ ...NVDA, name: null, price: null, dayPct: null, call: null, reason: null, spark: null, sparkPct: null, sparkLabel: null, logo: null }, "light");
    expect(bare).not.toContain('class="px"');
    expect(bare).not.toContain('class="call"');
    expect(bare).not.toContain('class="spark"');
    expect(bare).not.toContain("<img");
    expect(bare).toContain(">NVDA<");
  });

  it("escapes what comes from the store", () => {
    const html = renderStockWidget({ ...NVDA, name: 'A<b>"&', reason: "<img src=x onerror=alert(1)>" }, "light");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("A&lt;b&gt;&quot;&amp;");
  });

  it("has a small not-found card", () => {
    const html = renderWidgetNotFound("ZZZZ", "dark");
    expect(html).toContain("We can't show ZZZZ right now.");
    expect(html).toContain("noindex");
    expect(renderWidgetNotFound(null, "light")).toContain("That isn't a ticker we know.");
  });
});

describe("widgetReason", () => {
  it("never carries a price level or zone", () => {
    expect(widgetReason("Buy more under $178.60. Demand still outruns supply.")).toBe("Demand still outruns supply.");
    expect(widgetReason("Trim above 240 dollars while it sits in the sell zone.")).toBeNull();
  });

  it("keeps one whole sentence within the word budget, else tries the next candidate", () => {
    const long = "This is a very long thesis sentence that keeps going on and on well past the fifteen word budget for a card line.";
    expect(widgetReason(long, "Margins are widening again.")).toBe("Margins are widening again.");
    expect(widgetReason(long)).toBeNull();
    expect(widgetReason(null, undefined, "")).toBeNull();
    expect(widgetReason("Demand still outruns supply. Margins widen as the mix shifts to data center and buybacks go on.")).toBe(
      "Demand still outruns supply.",
    );
  });
});

describe("pieces", () => {
  it("formats moves with a real minus sign", () => {
    expect(widgetPct(-1.25)).toBe("−1.3%");
    expect(widgetPct(0.04)).toBe("0.0%");
    expect(widgetPct(null)).toBeNull();
  });

  it("draws a sparkline only from two usable points", () => {
    expect(sparkPath([1], 100, 20)).toBeNull();
    expect(sparkPath([1, Number.NaN, 0], 100, 20)).toBeNull();
    expect(sparkPath([1, 2], 100, 20)).toBe("M2.0 18.0L98.0 2.0");
    expect(sparkPath([5, 5, 5], 100, 20)).toBe("M2.0 10.0L50.0 10.0L98.0 10.0");
  });

  it("escapes attribute and text characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
