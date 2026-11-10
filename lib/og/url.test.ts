import { describe, expect, it } from "vitest";

import { fit } from "@/lib/og/cards";
import { levelFree, ogSignedPct, ogStamp, ogWindow, withoutCallSentence } from "@/lib/og/format";
import { OG_HEIGHT, OG_VERSION, OG_WIDTH, isOgPageKey, ogDay, ogImage, ogImageUrl, shareMetadata } from "@/lib/og/url";

describe("og image URLs", () => {
  it("are absolute, on the production host, and versioned", () => {
    const url = ogImageUrl(["stock", "NVDA"]);
    expect(url).toBe(`https://www.stocksbrew.online/api/og/stock/NVDA?v=${OG_VERSION}`);
    expect(new URL(url).protocol).toBe("https:");
  });

  it("is the default card for an empty path", () => {
    expect(ogImageUrl([])).toBe(`https://www.stocksbrew.online/api/og?v=${OG_VERSION}`);
    expect(ogImageUrl("")).toBe(`https://www.stocksbrew.online/api/og?v=${OG_VERSION}`);
  });

  it("accepts a slash path and keeps commas readable", () => {
    expect(ogImageUrl("compare/NVDA,AMD")).toBe(`https://www.stocksbrew.online/api/og/compare/NVDA,AMD?v=${OG_VERSION}`);
  });

  it("escapes what could break out of the path", () => {
    const url = ogImageUrl(["stock", "BRK B?x=1#y"]);
    expect(url).toContain("/api/og/stock/BRK%20B%3Fx%3D1%23y?v=");
    expect(new URL(url).pathname).toBe("/api/og/stock/BRK%20B%3Fx%3D1%23y");
  });

  it("adds the New York day when asked, so a link shared tomorrow gets tomorrow's card", () => {
    // 03:00 UTC on Nov 11 is still Nov 10 in New York.
    const now = new Date("2026-11-11T03:00:00Z");
    expect(ogDay(now)).toBe("2026-11-10");
    expect(ogImageUrl(["page", "briefing"], { daily: true, now })).toBe(
      `https://www.stocksbrew.online/api/og/page/briefing?v=${OG_VERSION}&d=2026-11-10`,
    );
  });

  it("describes the image the way Next metadata wants it", () => {
    const image = ogImage(["page", "markets"], "  Markets today  ");
    expect(image).toEqual({
      url: `https://www.stocksbrew.online/api/og/page/markets?v=${OG_VERSION}`,
      width: OG_WIDTH,
      height: OG_HEIGHT,
      alt: "Markets today",
      type: "image/png",
    });
    expect(ogImage([], "").alt).toBe("stocksbrew");
  });

  it("builds openGraph and twitter blocks with the same card", () => {
    const image = ogImage(["market", "crypto", "btc"], "Bitcoin");
    const meta = shareMetadata({ title: "Bitcoin", description: "Level and a year of closes", path: "markets/crypto/btc", image });
    expect(meta.openGraph.url).toBe("https://www.stocksbrew.online/markets/crypto/btc");
    expect(meta.openGraph.images).toEqual([image]);
    expect(meta.twitter.card).toBe("summary_large_image");
    expect(meta.twitter.images).toEqual([image]);
  });

  it("only knows the page keys it can draw", () => {
    expect(isOgPageKey("briefing")).toBe(true);
    expect(isOgPageKey("pricing")).toBe(true);
    expect(isOgPageKey("watchlist")).toBe(false);
    expect(isOgPageKey("")).toBe(false);
  });
});

describe("og text", () => {
  it("never shows add or trim levels", () => {
    expect(levelFree("AI demand is strong. Add below $170.50 and trim above $220.")).toBe("AI demand is strong.");
    expect(levelFree("Buy near 150 dollars. Margins keep rising.")).toBe("Margins keep rising.");
    expect(levelFree("It is inside our add zone.")).toBeNull();
    expect(levelFree("Upside and downside look balanced; keep the position.")).toBe("Upside and downside look balanced; keep the position.");
    expect(levelFree("")).toBeNull();
  });

  it("keeps a decimal price inside its sentence when dropping it", () => {
    // A naive split on "." would leave "60 if earnings hold." behind.
    expect(levelFree("Growth is real. Add near $178.60 if earnings hold.")).toBe("Growth is real.");
  });

  it("drops the call sentence the pill already shows", () => {
    expect(withoutCallSentence("NVDA fell 4.3% today while chips rose 0.8%. Our call: Hold.")).toBe("NVDA fell 4.3% today while chips rose 0.8%.");
    expect(withoutCallSentence("Our call on NVDA: Add.")).toBe("");
  });

  it("cuts long text at a sentence or clause before falling back to a word", () => {
    expect(fit("Short.", 40)).toBe("Short.");
    expect(fit("Space stocks led the gainers today. Four of them moved on contract news.", 50)).toBe("Space stocks led the gainers today.");
    expect(fit("AMD has the weakest margins (18% against 65%); NVDA grows revenue twice as fast", 60)).toBe("AMD has the weakest margins (18% against 65%).");
    expect(fit("one two three four five six seven eight nine ten", 20)).toBe("one two three four…");
  });

  it("formats changes with a real minus and no negative zero", () => {
    expect(ogSignedPct(4.31)).toBe("+4.3%");
    expect(ogSignedPct(-4.31)).toBe("−4.3%");
    expect(ogSignedPct(-0.01)).toBe("0.0%");
    expect(ogSignedPct(null)).toBeNull();
    expect(ogSignedPct(Number.NaN)).toBeNull();
  });

  it("stamps times in New York", () => {
    const now = new Date("2026-11-10T15:00:00Z");
    expect(ogStamp("2026-11-09T20:59:00Z", now)).toBe("Nov 9, 3:59 PM ET");
    expect(ogStamp("2026-11-09", now)).toBe("Nov 9");
    expect(ogStamp("2025-03-02", now)).toBe("Mar 2, 2025");
    expect(ogStamp("not a date", now)).toBeNull();
  });

  it("takes the last sessions of a series for the sparkline and skips bad closes", () => {
    expect(ogWindow([10, 0, 11, Number.NaN, 12], 2)).toEqual({ values: [11, 12], pct: (12 / 11 - 1) * 100 });
    expect(ogWindow([10], 63)).toEqual({ values: [], pct: null });
  });
});
