import { describe, expect, it } from "vitest";

import { newsJunk, newsRank, pickStockNews } from "@/lib/briefing-news";

const SUMMARY = "A summary long enough to stand as the card's sentence when it is opened.";
const story = (title: string, published_at = "2026-11-11T20:00:00Z", summary = SUMMARY) => ({ title, summary, published_at });
const nvda = { ticker: "NVDA", name: "NVIDIA Corporation", day_change_pct: 2.9 };
const amd = { ticker: "AMD", name: "Advanced Micro Devices", day_change_pct: 7.3 };
const qqq = { ticker: "QQQ", name: "Invesco QQQ Trust", day_change_pct: 2.3 };
const cat = { ticker: "CAT", name: "Caterpillar", day_change_pct: 2.9 };

describe("newsJunk", () => {
  it("names the round 6 examples as junk, each for its own reason", () => {
    expect(newsJunk(story("Stock Market Today, Nov. 11: Advanced Micro Devices Jumps -- and Not Only Because of CoreWeave's Results"))).toBe("roundup");
    expect(newsJunk(story("Dow Jones Futures: Techs Tumble Late As Nvidia May Oust CEO Huang"))).toBe("roundup");
    expect(newsJunk(story("Caterpillar (CAT) Stock Looks Like A Bargain On Its 222% Run"))).toBe("opinion");
    expect(newsJunk(story("Nvidia’s Board Is Reportedly Planning To Oust Jensen Huang Over Chinese Spy, Employee Misconduct Investigation"))).toBe("rumour");
    expect(newsJunk(story("Every December the Nasdaq-100 Reshuffles. QQQ Holders Feel It Even If They Never Trade"))).toBe("explainer");
    expect(newsJunk(story("3 Stocks Tied To Export Control Compliance As Nvidia Questions Spread"))).toBe("listicle");
  });

  it("leaves out rumour columns, filler, questions, law firms and stories with no summary", () => {
    expect(newsJunk(story("Update: Market Chatter: Nvidia CEO said to have…"))).toBe("rumour");
    expect(newsJunk(story("NVIDIA expected to oust Jensen Huang - report"))).toBe("rumour");
    expect(newsJunk(story("Costco (COST) Surpasses market returns: Some facts worth knowing"))).toBe("filler");
    expect(newsJunk(story("Can Caterpillar Stock Hit $820?"))).toBe("filler");
    expect(newsJunk(story("Michael Burry just made a big move on Caterpillar stock"))).toBe("filler");
    expect(newsJunk(story("Wall Street’s Newest Teradyne Bull Just Sent a $2 Billion Signal"))).toBe("filler");
    expect(newsJunk(story("Nvidia-Backed CoreWeave Is Surging: Here’s What It Means for the AI Boom"))).toBe("explainer");
    expect(newsJunk(story("Did You Lose Money Investing in Lululemon? Robbins LLP Urges Investors"))).toBe("law firm");
    expect(newsJunk(story("Nvidia ships a new chip", undefined, ""))).toBe("no summary");
    expect(newsJunk(story("Caterpillar raises its outlook", undefined, "For questions about this article or underlying research, email help@trefis.com."))).toBe("no summary");
  });

  it("keeps plain news", () => {
    expect(newsJunk(story("Costco sales rise 8% in October"))).toBeNull();
    expect(newsJunk(story("Lam Research Sinks 16% in a Week. Lam Responds With $25 Billion Buyback"))).toBeNull();
  });
});

describe("newsRank", () => {
  it("ranks a reason line on the stock above other news on it", () => {
    expect(newsRank(story("AMD wins a $10 billion data-center contract"), amd)).toBe(2);
    expect(newsRank(story("Analyst upgrades Caterpillar to Buy"), cat)).toBe(2);
    expect(newsRank(story("Caterpillar opens a new plant in Texas"), cat)).toBe(1);
  });

  it("needs the headline to name the stock, by ticker or a distinctive name", () => {
    expect(newsRank(story("Advanced Micro Devices wins a deal with Oracle"), amd)).toBe(2);
    // "Advanced" alone is not AMD.
    expect(newsRank(story("Advanced Drainage reports results"), amd)).toBeNull();
    expect(newsRank(story("Pfizer secures $1.5 billion from Blackstone"), nvda)).toBeNull();
    expect(newsRank(story("Nvidia unveils a new chip"), nvda)).toBe(1);
    expect(newsRank(story("Invesco QQQ sees record inflows"), qqq)).toBe(1);
  });

  it("drops a headline that says the stock went the other way that day by more than 1%", () => {
    expect(newsRank(story("Nvidia shares slip as chip stocks cool"), nvda)).toBeNull();
    expect(newsRank(story("Nvidia shares slip as chip stocks cool"), { ...nvda, day_change_pct: 0.4 })).toBe(1);
    expect(newsRank(story("AMD jumps on a new data-center deal"), { ...amd, day_change_pct: -3 })).toBeNull();
  });

  it("keeps an after-hours story, or one published after the quote, even when it goes the other way", () => {
    expect(newsRank(story("Nvidia shares slip in after-hours trading as its CEO steps down"), nvda)).toBe(2);
    const quoted = { ...nvda, price_as_of: "2026-11-11T21:00:00Z" };
    expect(newsRank(story("Nvidia stock sinks as its CEO is ousted", "2026-11-11T23:00:00Z"), quoted)).toBe(2);
    expect(newsRank(story("Nvidia stock sinks as its CEO is ousted", "2026-11-11T18:00:00Z"), quoted)).toBeNull();
  });

  it("does not rank a preview or an executive talking as a reason", () => {
    expect(newsRank(story("CrowdStrike CEO describes what a Hugging Face 2.0 would look like"), { ticker: "CRWD", name: "CrowdStrike Holdings", day_change_pct: 0.5 })).toBe(1);
    expect(newsRank(story("Caterpillar Q3 Earnings Preview"), cat)).toBe(1);
    expect(newsRank(story("Caterpillar beats Q3 estimates and raises guidance"), cat)).toBe(2);
  });

  it("knows the names headlines use for a company", () => {
    expect(newsRank(story("Disney raises its streaming price"), { ticker: "DIS", name: "The Walt Disney Company", day_change_pct: 0.2 })).toBe(1);
    expect(newsRank(story("Google wins a cloud contract"), { ticker: "GOOGL", name: "Alphabet Inc.", day_change_pct: 0.2 })).toBe(2);
    expect(newsRank(story("Lilly raises its sales forecast"), { ticker: "LLY", name: "Eli Lilly and Company", day_change_pct: 0.2 })).toBe(2);
    expect(newsRank(story("Trade Desk shares rise after results"), { ticker: "TTD", name: "The Trade Desk, Inc.", day_change_pct: 3 })).toBe(2);
  });
});

describe("pickStockNews", () => {
  it("takes the best ranked story, newest first within a rank", () => {
    const pick = pickStockNews(
      [
        story("Stock Market Today, Nov. 11: Advanced Micro Devices Jumps", "2026-11-11T22:52:00Z"),
        story("AMD is one to watch", "2026-11-11T21:00:00Z"),
        story("AMD raises its data-center revenue forecast", "2026-11-11T18:00:00Z"),
        story("AMD signs a new supply contract", "2026-11-11T19:00:00Z"),
      ],
      amd,
    );
    expect(pick?.title).toBe("AMD signs a new supply contract");
  });

  it("is null when nothing good is left: the card then has no headline", () => {
    expect(
      pickStockNews(
        [
          story("Every December the Nasdaq-100 Reshuffles. QQQ Holders Feel It Even If They Never Trade"),
          story("5 Charts Every QQQ Holder Should See"),
        ],
        qqq,
      ),
    ).toBeNull();
    expect(pickStockNews([story("Caterpillar (CAT) Stock Looks Like A Bargain On Its 222% Run")], cat)).toBeNull();
  });
});
