import { describe, expect, it } from "vitest";

import { headlineWordRead, headlineWordTone, withHeadlineTones } from "@/lib/wire-headline-tone";
import { groupByCompany } from "@/lib/wire-companies";
import { stockBuzz } from "@/lib/wire-read";
import { readTheWire, toneLean, type NewsLabels } from "@/lib/wire-read";
import { parseWireFilters, type WireItem } from "@/lib/wire-shared";

const NOW = Date.parse("2026-11-11T16:00:00Z");
const H = 3_600_000;
let n = 0;
function item(title: string, tickers: string[], hoursAgo = 1): WireItem {
  n += 1;
  return {
    id: `w${n}`,
    title,
    url: `https://example.com/${n}`,
    source: "Reuters",
    sourceKind: "publisher",
    publishedAt: new Date(NOW - hoursAgo * H).toISOString(),
    excerpt: "",
    excerptOrigin: "",
    tickers,
    tone: null,
    topics: [],
  };
}

describe("headlineWordTone", () => {
  it("reads clear finance words both ways", () => {
    expect(headlineWordTone("APPS Q2 Earnings Beat Estimates on Strong Ad Growth, Guidance Up")).toBe("positive");
    expect(headlineWordTone("Cloudflare (NET) Lifts Guidance as Enterprise Demand Drives Revenue Beat")).toBe("positive");
    expect(headlineWordTone("AMD Stock Just Got Massive Upgrade From Oppenheimer")).toBe("positive");
    expect(headlineWordTone("CoreWeave Surges 16% as Beat-and-Raise Quarter Eases Financing Fears")).toBe("positive");
    expect(headlineWordTone("Baird downgrades Nvidia on CEO Huang worries, AI uncertainty")).toBe("negative");
    expect(headlineWordTone("MercadoLibre Sinks 10% in a Week on a Profit Miss")).toBe("negative");
    expect(headlineWordTone("Exclusive: Qualcomm begins job cuts; India and California among regions impacted")).toBe("negative");
    expect(headlineWordTone("PayPal faces German antitrust probe over merchant fee rules")).toBe("negative");
  });

  it("says nothing for questions, guesses, adverts and mixed words", () => {
    expect(headlineWordTone("Can EXPD's Q3 Earnings Beat Sustain Growth as Freight Demand Shifts?")).toBeNull();
    expect(headlineWordTone("Will Earnings Upgrades Change Five Below (FIVE) Stock Narrative")).toBeNull();
    expect(headlineWordTone("AMD Price Prediction: AI Boom and Record Revenue Set the Stage for Another Monster Rally")).toBeNull();
    expect(headlineWordTone("NVDA Investors Have Opportunity to Lead NVIDIA Corporation Securities Fraud Lawsuit")).toBeNull();
    expect(headlineWordTone("Why Nvidia Stock Is Rising Despite Wall Street's First Call for Jensen Huang to Step Down")).toBeNull();
    expect(headlineWordTone("NVDA Stock Set For Best Day In Over 2 Months – Baird Downgrades Shares, Rallies Anyway")).toBeNull();
    expect(headlineWordTone("Don't miss these three dividend stocks")).toBeNull();
    expect(headlineWordTone("Dell Technologies to Hold Conference Call Nov. 24 to Discuss Results")).toBeNull();
    expect(headlineWordTone("")).toBeNull();
  });

  it("does not read a noun, a name or a product as a move", () => {
    expect(headlineWordTone("Billionaire sold Amazon before billions in gains")).toBeNull();
    expect(headlineWordTone("Nebius gains 13% on CoreWeave results")).toBe("positive");
    expect(headlineWordTone("Advanced Micro Devices unveils new MI400 AI chip")).toBeNull();
    expect(headlineWordTone("Rocket Lab launches its next Electron mission")).toBeNull();
    expect(headlineWordTone("A deep dive into Nvidia's data center business")).toBeNull();
    expect(headlineWordTone("Apple declines to comment on the report")).toBeNull();
    expect(headlineWordTone("Tesla drops prices on the Model Y in China")).toBeNull();
    expect(headlineWordTone("Meta drops its plan for a new campus")).toBeNull();
    expect(headlineWordTone("Intel sheds light on its foundry roadmap")).toBeNull();
    expect(headlineWordTone("Nintendo sets fall release for its next console")).toBeNull();
    expect(headlineWordTone("Microsoft upgrades Copilot with new agents")).toBeNull();
    expect(headlineWordTone("Apple's Beats unveils new headphones")).toBeNull();
    expect(headlineWordTone("Oracle CFO promises $30 billion plus in free cash flow by fiscal 2029 after a 70% plunge")).toBeNull();
    expect(headlineWordTone("Bernstein's $325 target says Oracle's selloff went too far")).toBeNull();
    expect(headlineWordTone("Entergy (ETR) rating upgrade to buy")).toBe("positive");
    expect(headlineWordTone("Morgan Stanley upgrades Nvidia to overweight")).toBe("positive");
    expect(headlineWordTone("Microsoft drops 3% on Anthropic threat to Office")).toBe("negative");
    expect(headlineWordTone("Rocket Lab rockets 12% after launch contract")).toBe("positive");
  });
});

describe("headlineWordTone guards", () => {
  it("reads a legal win as good news, and a settlement as neither", () => {
    expect(headlineWordTone("Coinbase wins dismissal of SEC lawsuit")).toBe("positive");
    expect(headlineWordTone("Intel investigation finds no wrongdoing, shares rise")).toBe("positive");
    expect(headlineWordTone("Apple wins appeal against EU fine")).toBe("positive");
    expect(headlineWordTone("Boeing cleared of fraud charges by federal jury")).toBe("positive");
    expect(headlineWordTone("Meta settles privacy lawsuit with Texas")).toBeNull();
    expect(headlineWordTone("SEC drops lawsuit against Coinbase")).toBe("positive");
    expect(headlineWordTone("Lawsuit against Apple dismissed")).toBe("positive");
    expect(headlineWordTone("Judge tosses lawsuit against Apple")).toBe("positive");
    expect(headlineWordTone("Probe into Tesla closed")).toBe("positive");
    expect(headlineWordTone("Coinbase lawsuit dropped by the SEC")).toBe("positive");
    // A price that settles is not a settlement.
    expect(headlineWordTone("Tesla sued as stock settles lower")).toBe("negative");
    expect(headlineWordTone("PayPal faces German antitrust probe over merchant fee rules")).toBe("negative");
  });

  it("counts a recall of things, not a person recalling something", () => {
    expect(headlineWordTone("Warren Buffett recalls his first stock purchase")).toBeNull();
    expect(headlineWordTone("Tesla recalls 200,000 vehicles over a camera fault")).toBe("negative");
    expect(headlineWordTone("Ford recalls Explorer SUVs over brake issue")).toBe("negative");
    expect(headlineWordTone("Abbott expands voluntary recall of baby formula")).toBe("negative");
  });

  it("does not read a move verb with into as a price move, unless it goes into the red", () => {
    expect(headlineWordTone("Meta slides into AI race")).toBeNull();
    expect(headlineWordTone("Apple jumps into the payments business")).toBeNull();
    expect(headlineWordTone("Nvidia slides into the red after the open")).toBe("negative");
    expect(headlineWordTone("Nvidia slides 3% after the open")).toBe("negative");
    expect(headlineWordTone("Rivian rises to the challenge with a new SUV")).toBeNull();
  });
});

describe("headlineWordRead", () => {
  const names = { NBIS: "Nebius Group N.V.", CRWV: "CoreWeave, Inc.", NVDA: "NVIDIA Corporation", AMD: "Advanced Micro Devices, Inc.", MS: "Morgan Stanley", COIN: "Coinbase Global, Inc." };

  it("gives one stock the tone of a headline naming only it", () => {
    expect(headlineWordRead("Coinbase wins dismissal of SEC lawsuit", ["COIN"], names)).toEqual({ tone: "positive", ticker: "COIN" });
    expect(headlineWordRead("Baird downgrades Nvidia on CEO worries", ["NVDA"], names)).toEqual({ tone: "negative", ticker: "NVDA" });
  });

  it("gives a two-company headline's tone only to the stock named before the move", () => {
    expect(headlineWordRead("Nebius gains 13% on CoreWeave results", ["NBIS", "CRWV"], names)).toEqual({ tone: "positive", ticker: "NBIS" });
    expect(headlineWordRead("Nebius gains 13% on CoreWeave results", ["CRWV", "NBIS"], names)).toEqual({ tone: "positive", ticker: "NBIS" });
    expect(headlineWordRead("AMD (AMD) slides 4% as Nvidia unveils a rival chip", ["NVDA", "AMD"], names)).toEqual({ tone: "negative", ticker: "AMD" });
  });

  it("skips a two-company headline when both or neither come first, or the stock is the verb's object", () => {
    expect(headlineWordRead("Nvidia and AMD shares jump on export news", ["NVDA", "AMD"], names)).toBeNull();
    expect(headlineWordRead("Chip stocks jump on export news", ["NVDA", "AMD"], names)).toBeNull();
    expect(headlineWordRead("Morgan Stanley upgrades Nvidia to overweight", ["MS", "NVDA"], names)).toBeNull();
    expect(headlineWordRead("Nebius gains 13% on CoreWeave results", ["NBIS", "CRWV"])).toBeNull();
    // An ordinary first word of a name ("Applied") is not a mention; "AI" is not the two-letter ticker AI.
    const more = { AMAT: "Applied Materials, Inc.", AI: "C3.ai, Inc.", APLD: "Applied Digital Corporation" };
    expect(headlineWordRead("Applied Digital jumps 9% as Applied Materials lags", ["APLD", "AMAT"], more)).toEqual({ tone: "positive", ticker: "APLD" });
    expect(headlineWordRead("AI chip names jump as $NVDA leads", ["AI", "NVDA"], { ...names, ...more })).toBeNull();
    expect(headlineWordRead("$NVDA jumps 5% as AMD lags", ["NVDA", "AMD"], names)).toEqual({ tone: "positive", ticker: "NVDA" });
  });
});

describe("withHeadlineTones", () => {
  it("never gives both stocks of a two-company headline the same tone", () => {
    const pair = item("Nebius gains 13% on CoreWeave results", ["NBIS", "CRWV"]);
    const labels = withHeadlineTones([pair], {}, { names: { NBIS: "Nebius Group N.V.", CRWV: "CoreWeave, Inc." } });
    expect(labels[pair.id]).toEqual({ tone: "positive", scope: "stock", theme: null, by: "words", ticker: "NBIS" });
    const quotes = { NBIS: { pct: 13, name: "Nebius Group N.V." }, CRWV: { pct: 2, name: "CoreWeave, Inc." } };
    const buzz = stockBuzz([pair], { labels, quotes, nowMs: NOW });
    expect(buzz.find((row) => row.ticker === "NBIS")!.tones).toEqual({ positive: 1, negative: 0, neutral: 0 });
    expect(buzz.find((row) => row.ticker === "CRWV")!.tones).toEqual({ positive: 0, negative: 0, neutral: 0 });
    const groups = groupByCompany([pair], { sinceMs: NOW - 24 * H, quotes, labels });
    expect(groups.find((group) => group.ticker === "CRWV")?.tones.positive ?? 0).toBe(0);
    expect(groups.find((group) => group.ticker === "NBIS")!.tones.positive).toBe(1);
  });


  it("adds word labels only where the model has none, for one or two named stocks inside the window", () => {
    const model = item("Nvidia plunges on probe", ["NVDA"]);
    const plain = item("Nvidia plunges on probe report", ["NVDA"]);
    const roundup = item("Nvidia, AMD and Intel rally", ["NVDA", "AMD", "INTC"]);
    const market = item("Stocks rally on jobs data", []);
    const old = item("Nvidia jumps on record quarter", ["NVDA"], 60);
    const quiet = item("Nvidia to present at conference", ["NVDA"]);
    const labels: NewsLabels = { [model.id]: { tone: "neutral", scope: "stock", theme: "Nvidia probe" } };
    const out = withHeadlineTones([model, plain, roundup, market, old, quiet], labels, { sinceMs: NOW - 48 * H });
    expect(out[model.id]).toEqual({ tone: "neutral", scope: "stock", theme: "Nvidia probe" });
    expect(out[plain.id]).toEqual({ tone: "negative", scope: "stock", theme: null, by: "words" });
    expect(out[roundup.id]).toBeUndefined();
    expect(out[market.id]).toBeUndefined();
    expect(out[old.id]).toBeUndefined();
    expect(out[quiet.id]).toBeUndefined();
    // The model's labels are never changed in place.
    expect(labels[plain.id]).toBeUndefined();
  });

  it("hands back the same object when it adds nothing", () => {
    const labels: NewsLabels = {};
    expect(withHeadlineTones([item("Nvidia to present at conference", ["NVDA"])], labels)).toBe(labels);
  });
});

describe("toneLean", () => {
  it("says a share of every story counted, or a lean in words when the side is under half", () => {
    expect(toneLean({ positive: 0, negative: 7, neutral: 3 })).toEqual({ side: "negative", pct: 70, text: "70% negative" });
    expect(toneLean({ positive: 0, negative: 3, neutral: 0 }, 10)).toEqual({ side: "negative", pct: 30, text: "Leans negative" });
    expect(toneLean({ positive: 4, negative: 1, neutral: 0 }, 6)?.text).toBe("67% positive");
  });

  it("says nothing without three stories with a tone, without a clear lean, or when the side is a sliver", () => {
    expect(toneLean({ positive: 0, negative: 2, neutral: 0 })).toBeNull();
    expect(toneLean({ positive: 3, negative: 2, neutral: 0 })).toBeNull();
    expect(toneLean({ positive: 1, negative: 1, neutral: 5 })).toBeNull();
    expect(toneLean({ positive: 0, negative: 3, neutral: 0 }, 20)).toBeNull();
    // Three against one out of eleven is a couple of stray headlines, not a lean.
    expect(toneLean({ positive: 1, negative: 3, neutral: 0 }, 11)).toBeNull();
    // 24.6% does not round its way past the quarter floor.
    expect(toneLean({ positive: 0, negative: 16, neutral: 0 }, 65)).toBeNull();
  });
});

describe("the news read with word tones", () => {
  it("gives a most-talked-about stock its lean from word labels and credits them in the source line", () => {
    const rows = [
      item("Nvidia plunges after probe widens", ["NVDA"]),
      item("Baird downgrades Nvidia on supply worries", ["NVDA"]),
      item("Nvidia sinks as lawsuit is filed", ["NVDA"]),
      item("Nvidia to present at a conference", ["NVDA"]),
      item("Nvidia names a new board member", ["NVDA"]),
    ];
    const labels = withHeadlineTones(rows, {}, { sinceMs: NOW - 48 * H });
    const reading = readTheWire(
      { items: rows, quotes: { NVDA: { pct: -4, name: "NVIDIA Corp" } }, labels, newestAt: rows[0]!.publishedAt, labelledBy: "Claude Haiku 5.5", labelledAt: null },
      { nowMs: NOW, filters: parseWireFilters(undefined) },
    );
    const nvda = reading.buzz.find((row) => row.ticker === "NVDA")!;
    expect(nvda.tones).toEqual({ positive: 0, negative: 3, neutral: 0 });
    expect(toneLean(nvda.tones, nvda.count)?.text).toBe("60% negative");
    expect(reading.labelledShare).toBe(0);
    expect(reading.tonedShare).toBe(60);
    expect(reading.read!.insights[0]!.text).toBe("NVDA fell 4.0% today on 5 stories, 60% of them negative.");
    expect(reading.read!.source).not.toContain("tone");
    expect(reading.read!.source).not.toContain("Claude");
  });
});
