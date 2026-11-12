import { describe, expect, it } from "vitest";

import { OG_HEADLINE_MAX, whole, wholeLines } from "@/lib/og/format";
import { OG_HEIGHT, OG_WIDTH, PORTFOLIO_OG_TOOLS, isOgPageKey } from "@/lib/og/url";
import { COPY_HUB_SEO, copySeoDescription, copySeoTitle } from "@/lib/seo/copy-seo";
import { pageLd, pageMetadata } from "@/lib/seo/page-meta";
import { TOOL_PAGE_SEO, toolPageLd, toolPageMetadata, type ToolPagePath } from "@/lib/seo/tool-pages";
import type { CopyRecord } from "@/lib/copy-trades-shared";

const PATHS = Object.keys(TOOL_PAGE_SEO) as ToolPagePath[];

function imageUrl(block: unknown): string {
  const images = (block as { images?: Array<{ url: string }> }).images ?? [];
  expect(images).toHaveLength(1);
  return images[0]!.url;
}

describe("tool page search and share metadata", () => {
  it.each(PATHS)("%s has a short title, a description that shows whole, and a canonical", (path) => {
    const page = TOOL_PAGE_SEO[path];
    expect(page.title.length).toBeLessThanOrEqual(50);
    expect(page.description.length).toBeLessThanOrEqual(155);
    expect(page.description.length).toBeGreaterThan(80);
    expect(page.description).not.toMatch(/…|\.\.\./);
    const meta = toolPageMetadata(path);
    expect(meta.title).toBe(page.title);
    expect(meta.alternates?.canonical).toBe(path);
    // Indexed: a crawler sees the example, never anyone's holdings.
    expect(meta.robots).toBeUndefined();
  });

  it.each(PATHS)("%s puts the same card on Open Graph and Twitter, with its own URL", (path) => {
    const meta = toolPageMetadata(path);
    const og = imageUrl(meta.openGraph);
    expect(imageUrl(meta.twitter)).toBe(og);
    expect(new URL(og).pathname).toBe(`/api/og/${TOOL_PAGE_SEO[path].card.join("/")}`);
    expect((meta.openGraph as { url?: string }).url).toBe(`https://www.stocksbrew.online${path}`);
    expect((meta.openGraph as { images: Array<{ width: number; height: number }> }).images[0]).toMatchObject({ width: OG_WIDTH, height: OG_HEIGHT });
    expect((meta.twitter as { card?: string }).card).toBe("summary_large_image");
  });

  it("only points at cards the image route can draw", () => {
    for (const path of PATHS) {
      const [family, key] = TOOL_PAGE_SEO[path].card;
      if (family === "portfolio") expect((PORTFOLIO_OG_TOOLS as readonly string[]).includes(key!)).toBe(true);
      else expect(family === "page" && isOgPageKey(key!)).toBe(true);
    }
  });

  it("gives /explore and /markets different searches", () => {
    const explore = TOOL_PAGE_SEO["/explore"];
    const markets = TOOL_PAGE_SEO["/markets"];
    expect(explore.title).toMatch(/^Stock market today/);
    expect(markets.title).toMatch(/^Market prices/);
    expect(explore.keywords.filter((word) => markets.keywords.includes(word))).toEqual([]);
  });

  it("marks a personal page noindex but still followable", () => {
    const meta = pageMetadata({ title: "A basket", description: "x".repeat(90), path: "/baskets/abc", card: ["basket", "abc"], alt: "A basket", noindex: true, canonical: "/themes/ai" });
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates?.canonical).toBe("/themes/ai");
  });

  it("writes a WebPage and a breadcrumb trail from Home", () => {
    const [webPage, crumbs] = toolPageLd("/portfolio/xray") as Array<Record<string, unknown>>;
    expect(webPage).toMatchObject({ "@type": "WebPage", url: "https://www.stocksbrew.online/portfolio/xray", isPartOf: { "@id": "https://www.stocksbrew.online/#website" } });
    const items = (crumbs as { itemListElement: Array<{ name: string; item: string; position: number }> }).itemListElement;
    expect(items.map((item) => item.name)).toEqual(["Home", "My stocks", "Analysis"]);
    expect(items[0]!.item).toBe("https://www.stocksbrew.online");
    expect(items.map((item) => item.position)).toEqual([1, 2, 3]);
    expect(pageLd({ name: "n", description: "d", path: "/a", crumbs: [] })).toHaveLength(2);
  });
});

describe("copy test search copy", () => {
  const record = {
    kind: "fund",
    slug: "berkshire-hathaway",
    name: "Berkshire Hathaway",
    start_date: "2020-02-14",
    end_date: "2026-11-09",
    copy: { end_value: 23_688 },
    spy: { end_value: 24_639 },
  } as unknown as CopyRecord;

  it("keeps the hub short", () => {
    expect(COPY_HUB_SEO.title.length).toBeLessThanOrEqual(50);
    expect(COPY_HUB_SEO.description.length).toBeLessThanOrEqual(155);
  });

  it("asks the question when the name fits, and says the result", () => {
    expect(copySeoTitle(record)).toBe("What if you copied Berkshire Hathaway's 13F moves?");
    const description = copySeoDescription(record);
    expect(description).toContain("$23,688");
    expect(description).toContain("$24,639");
    expect(description.length).toBeLessThanOrEqual(155);
  });

  it("says when a record that ended stopped", () => {
    const ended = { ...record, kind: "congress", name: "Morgan McGarvey", start_date: "2023-03-01", end_date: "2024-12-11", stopped: true } as unknown as CopyRecord;
    expect(copySeoTitle(ended)).toBe("What if you copied Morgan McGarvey's trades?");
    expect(copySeoDescription(ended)).toContain("from Mar 2023 until Dec 2024");
  });

  it("falls back to a shorter title for a long name", () => {
    const long = { ...record, name: "Pershing Square Capital Management International" } as unknown as CopyRecord;
    expect(copySeoTitle(long)).toBe("Pershing Square Capital Management International: copy-trade backtest");
    expect(copySeoDescription(long).length).toBeLessThanOrEqual(175);
  });
});

describe("share card sentences", () => {
  it("keeps a sentence whole or leaves it out, never cut with an ellipsis", () => {
    expect(whole("Short and whole.", 40)).toBe("Short and whole.");
    const two = "The first sentence is the one that fits on the card. The second one would push it over the limit by a lot.";
    expect(whole(two, 60)).toBe("The first sentence is the one that fits on the card.");
    expect(whole("x".repeat(OG_HEADLINE_MAX + 1), OG_HEADLINE_MAX)).toBeNull();
    expect(whole("   ", 10)).toBeNull();
    expect(whole(null, 10)).toBeNull();
  });

  it("keeps a figure like $1.48 million inside its sentence", () => {
    expect(whole("Even the weakest replay gets to $1.48 million by 55. Then more words follow here to go long.", 60)).toBe(
      "Even the weakest replay gets to $1.48 million by 55.",
    );
  });

  it("splits before a sentence that starts with a dollar figure", () => {
    expect(whole("The example should pay about $1,220 this year. $55 of it is already announced, and the rest is estimated from last year.", 60)).toBe(
      "The example should pay about $1,220 this year.",
    );
  });

  it("takes the lines that fit, in order, up to two", () => {
    const lines = wholeLines([
      { text: "x".repeat(200), tone: "flat" },
      { text: "Fits.", tone: "up" },
      { text: "Also fits.", tone: "down" },
      { text: "Not needed.", tone: "flat" },
    ]);
    expect(lines).toEqual([
      { text: "Fits.", tone: "up" },
      { text: "Also fits.", tone: "down" },
    ]);
  });
});
