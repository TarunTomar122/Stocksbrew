import type { Metadata } from "next";
import { describe, expect, it, vi } from "vitest";

/**
 * Every page family puts an absolute share image on both openGraph and
 * twitter. Pages are imported for real; only what would touch the network
 * (or React's server-only `cache`) is stubbed.
 */

vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/font/google", () => ({ Instrument_Sans: () => ({ variable: "", className: "" }) }));
// `next/font/local` only resolves inside the Next compiler.
vi.mock("next/font/local", () => ({ default: () => ({ variable: "", className: "" }) }));
vi.mock("@/lib/og/data", () => ({ stockShareLine: async () => "Our call on NVDA: Hold. AI growth remains powerful." }));
vi.mock("@/lib/stock", async (original) => ({
  ...(await original<typeof import("@/lib/stock")>()),
  // The stock page 404s a ticker we hold nothing for, so NVDA has to exist here.
  getStockSummary: async (symbol: string) => (symbol.toUpperCase() === "NVDA" ? { ticker: "NVDA", name: "NVIDIA Corporation", instrument_id: "US_NVDA" } : null),
}));
vi.mock("@/lib/strategies", async (original) => ({
  ...(await original<typeof import("@/lib/strategies")>()),
  getStrategy: async (slug: string) => (slug === "dual-momentum" ? { slug, name: "Asset-class momentum", tagline: "The three strongest of eleven funds." } : null),
}));

const OG = /^https:\/\/www\.stocksbrew\.online\/api\/og(\/[^?]*)?\?v=\d+/;

type ImageLike = { url: string | URL; width?: number | string; height?: number | string; alt?: string };

function images(block: unknown): ImageLike[] {
  const list = (block as { images?: unknown } | undefined)?.images;
  const arr = Array.isArray(list) ? list : list ? [list] : [];
  return arr.map((item) => (typeof item === "string" || item instanceof URL ? { url: item } : (item as ImageLike)));
}

function expectShareImage(meta: Metadata, path: string) {
  const og = images(meta.openGraph);
  const tw = images(meta.twitter);
  expect(og).toHaveLength(1);
  expect(tw).toHaveLength(1);
  const url = String(og[0]!.url);
  expect(url).toMatch(OG);
  expect(new URL(url).pathname).toBe(`/api/og${path}`);
  expect(String(tw[0]!.url)).toBe(url);
  expect(og[0]!.width).toBe(1200);
  expect(og[0]!.height).toBe(630);
  expect(og[0]!.alt).toBeTruthy();
  expect((meta.twitter as { card?: string }).card).toBe("summary_large_image");
}

describe("share images in page metadata", { timeout: 120_000 }, () => {
  it("root layout has the default card", async () => {
    const { metadata } = await import("@/app/layout");
    expect(String(metadata.metadataBase)).toBe("https://www.stocksbrew.online/");
    expectShareImage(metadata, "");
  });

  it("home page uses the headline card with a specific title", async () => {
    const { generateMetadata } = await import("@/app/page");
    const meta = generateMetadata();
    expectShareImage(meta, "");
    expect(String(meta.openGraph?.title)).toContain("tells you what to buy and why");
  });

  it("stock page has the stock's own card and our call in the description", async () => {
    const { generateMetadata } = await import("@/app/(app)/stock/[symbol]/page");
    const meta = await generateMetadata({ params: Promise.resolve({ symbol: "nvda" }) });
    expectShareImage(meta, "/stock/NVDA");
    expect(meta.openGraph?.description).toContain("Our call on NVDA: Hold.");
    expect(String(images(meta.openGraph)[0]!.url)).toMatch(/[?&]d=\d{4}-\d{2}-\d{2}/);
  });

  it("strategy page has the strategy card", async () => {
    const { generateMetadata } = await import("@/app/(app)/strategies/[slug]/page");
    expectShareImage(await generateMetadata({ params: { slug: "dual-momentum" } }), "/strategy/dual-momentum");
  });

  it("market class page has its card", async () => {
    const { generateMetadata } = await import("@/app/(app)/markets/[class]/page");
    const meta = await generateMetadata({ params: Promise.resolve({ class: "crypto" }) });
    expectShareImage(meta, "/market/crypto");
    expect(meta.openGraph?.url).toBe("https://www.stocksbrew.online/markets/crypto");
  });

  it("docs guide and blog post have their own cards", async () => {
    const { GUIDES } = await import("@/lib/docs");
    const guide = GUIDES[0]!;
    const docs = await import("@/app/(app)/docs/[section]/[slug]/page");
    expectShareImage(docs.generateMetadata({ params: { section: guide.section, slug: guide.slug } }), `/docs/${guide.section}/${guide.slug}`);

    const { indexableBlogPosts } = await import("@/lib/blog-data");
    const post = indexableBlogPosts[0]!;
    const blog = await import("@/app/(app)/blog/[slug]/page");
    expectShareImage(blog.generateMetadata({ params: { slug: post.slug } }), `/blog/${post.slug}`);
  });

  it("static pages carry a card too", async () => {
    const pricing = await import("@/app/(app)/pricing/page");
    expectShareImage(pricing.metadata, "/page/pricing");
    const briefing = await import("@/app/(app)/briefing/page");
    expectShareImage(briefing.generateMetadata(), "/page/briefing");
  });

  it("portfolio tools, agents and the market pages carry their own cards", async () => {
    const xray = await import("@/app/(app)/portfolio/xray/page");
    expectShareImage(xray.metadata, "/portfolio/xray");
    expect(xray.metadata.openGraph?.url).toBe("https://www.stocksbrew.online/portfolio/xray");
    const stress = await import("@/app/(app)/portfolio/stress/page");
    expectShareImage(stress.metadata, "/portfolio/stress");
    const agents = await import("@/app/(app)/agents/page");
    expectShareImage(agents.metadata, "/page/agents");
    const explore = await import("@/app/(app)/explore/page");
    expectShareImage(explore.generateMetadata(), "/page/explore");
    const markets = await import("@/app/(app)/markets/page");
    expectShareImage(markets.generateMetadata(), "/page/markets");
    expect(String(explore.generateMetadata().title)).not.toBe(String(markets.generateMetadata().title));
  });

  it("a typed basket request is left out of search", async () => {
    const page = await import("@/app/(app)/baskets/new/page");
    expectShareImage(page.generateMetadata({ searchParams: {} }), "/page/baskets");
    expect(page.generateMetadata({ searchParams: {} }).robots).toBeUndefined();
    expect(page.generateMetadata({ searchParams: { q: "cheap banks" } }).robots).toEqual({ index: false, follow: false });
  });
});
