import { describe, expect, it } from "vitest";

import type { BriefingPosition } from "@/lib/briefing";
import type { MovedCard } from "@/lib/briefing-face";
import type { OvernightCard } from "@/lib/briefing-overnight";
import type { SinceCard } from "@/lib/since-visit";

import { briefingBiggest } from "./briefing-biggest";

const position = (ticker: string, relation: "holding" | "watching"): BriefingPosition => ({
  instrument_id: `US_${ticker}`,
  ticker,
  name: ticker,
  relation,
  price: 100,
  day_change_pct: 0,
  price_as_of: null,
  stance: null,
  call_summary: null,
  watch_out: null,
  add_below: null,
  breakout_above: null,
  trim_above: null,
  earnings_date: null,
  earnings_time: null,
  pre_earnings_headline: null,
});

const moved = (patch: Partial<MovedCard> & Pick<MovedCard, "ticker" | "kind" | "line" | "pct">): MovedCard => ({ name: patch.ticker, price: 50, call: null, href: `/stock/${patch.ticker}`, source: null, ...patch });
const since = (patch: Partial<SinceCard> & Pick<SinceCard, "ticker" | "kind" | "line">): SinceCard => ({ name: patch.ticker, price: 50, pct: 0.5, call: null, href: `/stock/${patch.ticker}`, ...patch });

const CBRS: OvernightCard = { ticker: "CBRS", name: "Cerebras Systems", session: "post", pct: 18.3, price: 115.68, asOf: "2026-11-12T23:59:00.000Z", line: "Reported after the close yesterday: raised its outlook", holding: true };

describe("the briefing's biggest things", () => {
  it("ranks the Overnight report, the news moves and a big insider buy from the modules, one card per stock", () => {
    const things = briefingBiggest({
      positions: [position("CBRS", "holding"), position("SMCI", "holding"), position("AMD", "watching"), position("MRVL", "holding"), position("COHR", "watching")],
      overnight: [CBRS],
      moved: [
        moved({ ticker: "SMCI", kind: "move", pct: -11.3, line: "Super Micro fell after DOJ China-smuggling probe." }),
        moved({ ticker: "AMD", kind: "news", pct: 5.9, line: "William Blair upgrades AMD to Outperform." }),
        moved({ ticker: "MRVL", kind: "move", pct: -2.6, line: "Marvell slipped with chip stocks." }),
      ],
      since: [since({ ticker: "COHR", kind: "insider", line: "2 insiders bought $1.2 million." }), since({ ticker: "MRVL", kind: "call", line: "Our call moved to Keep." })],
      priceDay: "2026-11-12",
      sourceOf: (card) => (card.ticker === "SMCI" ? "Reuters, Nov 12" : null),
      reportDays: { CBRS: "2026-11-11" },
      reports: { CBRS: "CBRS reported revenue of $211M, up 55% from a year ago and raised its outlook." },
    });
    expect(things.map((thing) => [thing.ticker, thing.kind])).toEqual([
      ["CBRS", "results"],
      ["SMCI", "news"],
      ["AMD", "analyst"],
      ["COHR", "insider"],
    ]);
    expect(things[0]).toMatchObject({ session: "post", pct: 18.3, price: 115.68, line: "Reported revenue of $211M, up 55% from a year ago and raised its outlook.", day: "2026-11-11" });
    expect(things[1]).toMatchObject({ source: "Reuters, Nov 12", day: "2026-11-12", holding: true });
  });

  it("leaves out a small move, a call change, a filing, an insider sale and a several-session move", () => {
    const things = briefingBiggest({
      positions: [position("A", "holding")],
      overnight: [],
      moved: [moved({ ticker: "A", kind: "news", pct: 2, line: "A slipped." })],
      since: [
        since({ ticker: "B", kind: "call", line: "Our call moved." }),
        since({ ticker: "C", kind: "filing", line: "Filed an 8-K on Tuesday." }),
        // A sale is not an "Insider buy", however big.
        since({ ticker: "D", kind: "insider", line: "CEO sold $5.2M of shares." }),
        // A move over several sessions stays in Since you last looked: its figure is not the card's day move.
        since({ ticker: "E", kind: "move", pct: 1, line: "Down 14% over 3 sessions." }),
      ],
      priceDay: "2026-11-12",
    });
    expect(things).toEqual([]);
  });
});
