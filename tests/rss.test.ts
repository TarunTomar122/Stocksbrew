import { parseRssFeed } from "@/lib/rss";
import { SOURCE_REGISTRY } from "@/lib/sources";

import { loadFixture } from "./helpers";

describe("RSS parsing", () => {
  it("parses publisher feeds into normalized articles", () => {
    const source = SOURCE_REGISTRY.find((entry) => entry.id === "livemint-markets");
    expect(source).toBeDefined();

    const articles = parseRssFeed(loadFixture("livemint-markets.xml"), source!);
    expect(articles).toHaveLength(2);
    expect(articles[0]?.sourceName).toBe("Mint Markets");
    expect(articles[0]?.topicLabel).toBe("Tipco Engineering IPO");
  });
});
