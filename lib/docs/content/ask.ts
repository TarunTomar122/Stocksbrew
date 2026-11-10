import { h2, note, p, table, ul, warn } from "@/lib/docs/build";
import { ASK_LIMITS } from "@/lib/ask-config";
import type { Guide } from "@/lib/docs/types";

const UPDATED = "2026-11-09";
/** Guides whose facts were rechecked against the code and changed. */
const REVISED = "2026-11-10";
const SURFACE = { label: "Open Ask", href: "/ask" };

export const ASK_GUIDES: Guide[] = [
  {
    section: "ask",
    slug: "how-sources-work",
    title: "How sources work in Ask",
    summary: "Ask is a chat that answers from our data. Every figure in an answer has to come from a lookup made in that conversation, and the lookup is shown to you.",
    updated: UPDATED,
    surface: SURFACE,
    blocks: [
      p("Ask is a language model with access to the same data as the rest of the product. The model writes the sentences. It does not supply the numbers."),
      h2("The one rule about numbers"),
      p("Every figure in an answer, whether a price, a percentage, a ratio, a date or a dollar amount, must appear in the result of a lookup made during that conversation. The model is instructed that it has no market data of its own and that anything it remembers is stale."),
      ul(
        "If no lookup returned the figure, the answer says we do not have it.",
        "The model is told not to do its own arithmetic to produce new figures. A return over a period comes from the price history lookup, not from mental maths.",
        "Figures are copied as returned. No re-rounding.",
        "If a lookup fails, the answer says what could not be found instead of answering anyway.",
      ),
      h2("What it can look up"),
      table(
        ["Lookup", "Returns"],
        [
          ["A stock", "The same data as the stock report: price, call, fundamentals, earnings."],
          ["Price history", "Returns over a period, from adjusted daily closes."],
          ["Compare", "Several stocks on the same measures."],
          ["The market today", "Indices, sectors and the day's movers."],
          ["The wire", "Recent headlines with publisher and time."],
          ["The calendar", "Earnings dates and estimates."],
          ["Investors", "Fund 13F filings, House disclosures and Form 4 insider trades."],
          ["Markets", "Indices, rates, commodities, currencies and crypto."],
          ["Screens and themes", "Our ready-made screens and idea baskets."],
          ["Backtest", "A fixed-weight backtest, always described as simulated, with the period and the main caveat."],
          ["Basket", "A list of companies that fit a thesis you describe, with a reason per line."],
          ["Your portfolio", "What you hold and watch, and what changed. Signed in only."],
          ["Web search", "Used only when the lookups above cannot answer."],
        ],
      ),
      h2("How a source is shown"),
      ul(
        "Each lookup appears as a card above the answer, with the data it returned, where it came from and the time it is from.",
        "While the answer is being written you can see which lookup is running.",
        "The text names the source in words when it matters, for example: from its latest 13F, filed Nov 14.",
        "Tables and charts are in the cards. The text does not rebuild them.",
      ),
      h2("Checking an answer"),
      p("Read the cards first. If a number in the text is not in a card, do not rely on it and tell us. That should not happen, and when it does it is a bug we want to hear about. See [Corrections](/docs/methodology/corrections)."),
      h2("Your portfolio in Ask"),
      p("Signed in, Ask can read what you hold and watch. Those are the positions you typed in, not a broker feed, so it treats them as possibly incomplete. Asking takes an account: sign in free to ask."),
      note("Conversations are saved to your account so you can return to them. The most recent 40 are listed, and each keeps its last 60 messages. See [Security](/security) for what account deletion removes."),
      warn("Web search results are other people's pages. They are shown as such, and a figure from the web is not held to the standard of a figure from a filing.", "Web results"),
    ],
    related: ["ask/what-it-will-not-do", "methodology/model-written-vs-computed", "methodology/data-sources"],
  },
  {
    section: "ask",
    slug: "what-it-will-not-do",
    title: "What Ask will not do",
    summary: "It will not trade, will not tell you what to buy, will not guess a number and will not change your account without a yes. The limits, and why each one is there.",
    updated: REVISED,
    surface: SURFACE,
    blocks: [
      h2("It will not place a trade"),
      p("stocksbrew does not connect to a brokerage. Ask has no way to buy or sell anything. If you ask it to, it says so and offers research instead."),
      h2("It will not tell you what to buy or sell"),
      p("Ask lays out what the data says and what would change the picture. It does not know your finances, your taxes or your other holdings, so it does not give personal advice. A question like which of these is cheaper on free cash flow gets a direct answer. A question like should I buy this gets the evidence on both sides."),
      h2("It will not guess"),
      ul(
        "No lookup result, no number.",
        "When there is no confirmed reason for a price move, it says: We have not found a confirmed reason for the move.",
        "It does not forecast a price or a return.",
        "A backtest is always called simulated, with its period.",
      ),
      h2("It will not change your account on its own"),
      p("Ask can suggest adding names to your portfolio or setting a price alert (alerts are part of Pro). Each suggestion arrives as a card with a Confirm button. Nothing is saved until you press it, and Ask is instructed never to say something was saved when it was only proposed."),
      h2("Limits"),
      table(
        ["Limit", "Value"],
        [
          ["Questions per day", `None signed out (sign in to ask), ${ASK_LIMITS.free.questionsPerDay} on Free, ${ASK_LIMITS.pro.questionsPerDay} on Pro. The count resets at midnight UTC.`],
          ["Length of one question", "2,000 characters."],
          ["Lookups per answer", "Up to 8 rounds, then it has to write."],
          ["Conversation memory", "The last 16 turns are sent back to the model."],
        ],
      ),
      h2("What it is weak at"),
      ul(
        "**Anything outside our coverage.** A stock we do not cover gets a short answer.",
        "**Very recent events.** A headline from the last few minutes may not be on the wire yet.",
        "**Long multi-step analysis.** It is built for a question and an answer, not a twenty-page report.",
        "**Reading documents you paste.** It answers from our data, not from text you supply.",
      ),
      warn("A fluent answer is not a correct one. The discipline above reduces mistakes. It does not remove them. Check the cards.", "It is still a language model"),
    ],
    related: ["ask/how-sources-work", "start/what-stocksbrew-is", "methodology/model-written-vs-computed"],
  },
];
