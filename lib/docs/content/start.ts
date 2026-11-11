import { h2, note, ol, p, steps, table, ul, warn } from "@/lib/docs/build";
import type { Guide } from "@/lib/docs/types";
import { CALL_COVERAGE } from "@/lib/brand-copy";
import { FREE_COVERED_STOCKS } from "@/lib/entitlements";
import { US_PRO_MONTHLY, US_PRO_YEARLY } from "@/lib/pricing";

const UPDATED = "2026-11-09";
/** Guides whose facts were rechecked against the code and changed. */
const REVISED = "2026-11-10";

export const START_GUIDES: Guide[] = [
  {
    section: "start",
    slug: "what-stocksbrew-is",
    title: "What stocksbrew is and is not",
    summary:
      "A research and tracking tool for US stocks. It reads the market for the names you own or watch and tells you what changed. It never touches your money.",
    updated: REVISED,
    blocks: [
      p(
        "stocksbrew helps you analyse and track US stocks. You tell it what you own and what you are watching. Each day it tells you what moved, why when we can confirm a reason, and what is coming up. Everything else in the product exists to help you check an idea before you act on it somewhere else.",
      ),
      h2("What it is"),
      ul(
        "**A daily briefing.** One ordered read of what happened to your names, with the items that need a decision first. See [How to read a briefing](/docs/start/read-a-briefing).",
        "**A portfolio you type in.** Holdings with a size and a cost, and a list of names you only watch. See [Adding holdings](/docs/portfolio/adding-holdings).",
        "**A report on every stock we cover.** Price, financials, valuation, earnings, ownership, news, and our call. See [How to read a stock report](/docs/start/read-a-stock-report).",
        "**A research desk.** A news wire, a calendar, a screener, idea baskets, side-by-side comparison, other markets, SEC filings and crowd signals.",
        "**Public filings turned into something you can follow.** Fund 13F filings, House trade disclosures and insider Form 4s, each measured from the day the public could first see them.",
        "**Rules you can test.** Strategies with a backtest and a live record kept apart, and a backtester you can run on your own tickers.",
        "**Agents that watch for you.** A standing job checks a rule on a schedule, an event or a price, and writes down what it found every time, including when it found nothing.",
        "**Ask.** A chat that answers from our data and shows where each number came from.",
      ),
      h2("What it is not"),
      ul(
        "**Not a broker.** We do not connect to a brokerage or a bank, and we cannot place, change or cancel a trade. There is no code in the product that can.",
        "**Not an investment adviser.** The call on a stock is produced by fixed rules from public data. It does not know your income, your taxes or what else you own outside the app.",
        "**Not a live quote screen.** Prices are fetched in batches, not tick by tick. Every price shows the time it is from. See [Where the data comes from](/docs/methodology/data-sources).",
        "**Not a predictor.** A backtest describes the past. A call describes the evidence today. Neither tells you what a stock will do next.",
        "**Not global.** We cover US-listed stocks and funds. Other markets appear on [Markets](/markets) as context only.",
      ),
      note(
        "When we do not have a number we leave the space empty or say so. We do not show a zero in place of something unknown, and we do not write a reason for a price move we could not confirm.",
        "The rule we hold ourselves to",
      ),
      h2("Who it is for"),
      p(
        "Someone who follows a handful to a few dozen US stocks, makes their own decisions, and wants to stop reopening the same tabs every morning. If you trade intraday on live order flow, this is the wrong tool.",
      ),
    ],
    related: ["start/first-ten-minutes", "start/free-vs-pro", "methodology/model-written-vs-computed"],
  },
  {
    section: "start",
    slug: "first-ten-minutes",
    title: "Your first ten minutes",
    summary: "Seven steps from an empty account to a briefing that is about your stocks, with one agent set and, on Pro, one alert.",
    updated: REVISED,
    blocks: [
      p("You can read stock reports, the wire and the calendar without an account. The steps below are what make the product yours."),
      steps(
        [
          "Open a stock you know well",
          "Use the search box (Cmd+K or Ctrl+K on a keyboard) and open a company you already follow. Check the report against what you know. If our numbers disagree with a filing, tell us: see [Corrections](/docs/methodology/corrections).",
        ],
        [
          "Sign in with Google",
          "Sign-in is Google only. We receive your name, email address and profile picture from Google and nothing else. There is no password to set. See [Security](/security).",
        ],
        [
          "Add what you own",
          `In the **Track it** panel of the stock report, add the stock as a holding if you own it or to your watchlist if you are only following it. For a holding, enter the number of shares and your average cost. The sizes stay on your account and are what the briefing uses to work out your day. Tracking is unlimited; Free covers ${FREE_COVERED_STOCKS} stocks in full. See [Adding holdings](/docs/portfolio/adding-holdings).`,
        ],
        [
          "Read today's briefing",
          "Open [Briefing](/briefing). With names on your account it switches from the market view to yours. Start with **Needs you**. See [How to read a briefing](/docs/start/read-a-briefing).",
        ],
        [
          "Set one price alert (Pro)",
          "Alerts are part of Pro and arrive by email. On a stock report, set an alert above or below a price. It fires when a fetched price is past the level. On Free, skip this step: an agent can watch a price for you and report in the app. See [Alerts](/docs/portfolio/alerts).",
        ],
        [
          "Start one agent",
          "Open [Agents](/agents) and start **Morning check**. Before it starts you see what it would have reported over the last four weeks. See [Triggers](/docs/agents/triggers).",
        ],
        [
          "Ask one question",
          "Open [Ask](/ask) and ask something you would otherwise have looked up, such as when a company reports next. Check that each figure in the answer names its source.",
        ],
      ),
      h2("What to do on day two"),
      ol(
        "Read the briefing again and mark each item **Got it** or **Keep watching**. What is left under Needs you is your open list.",
        "Open the [practice account](/practice) if you want to try an idea with paper money first.",
        "Pick one investor on [Follow](/follow) and read [how their record is measured](/docs/follow/filing-date-performance) before you trust the number.",
      ),
    ],
    related: ["start/read-a-briefing", "portfolio/adding-holdings", "agents/triggers"],
  },
  {
    section: "start",
    slug: "read-a-briefing",
    title: "How to read a briefing",
    summary: "The briefing is ordered by what needs you. Each item gives the number, the reason if we have one, a next step and the source.",
    updated: REVISED,
    surface: { label: "Open the Briefing", href: "/briefing" },
    blocks: [
      p(
        "The briefing is built from the same data as the rest of the product and covers the latest market day we hold. Signed out, it is a market view: the indices and the day's largest movers. Signed in with names on your account, it is about those names.",
      ),
      h2("The top of the page"),
      ul(
        "**The summary line.** One sentence assembled from the items below it. It is put together from the items, so it cannot say something the items do not.",
        "**Your day.** If your holdings have sizes, we show what they did today in dollars and percent. It also says how many holdings could be counted, for example 7 of 9, because a holding without a size or a price cannot be added up.",
        "**A stale note.** If the freshest data is from an earlier session than today, the page says so at the top.",
      ),
      h2("The four parts"),
      table(
        ["Part", "What goes in it"],
        [
          ["Needs you", "Things that may call for a decision: a large move in a holding, a changed call, a stock that entered its add or trim zone, an alert that fired, earnings very close."],
          ["Worth knowing", "Smaller updates on your names: news, a disclosed trade by a member of Congress, a filing, a spike in discussion."],
          ["Coming up", "Earnings and other dated events in the next seven days, soonest first."],
          ["Quiet", "The names where nothing happened, listed so you know they were checked."],
        ],
      ),
      h2("Anatomy of one item"),
      ul(
        "**Headline with the number.** What happened and by how much.",
        "**Why it matters.** One or two plain sentences. For a holding it also says how large the position is on your account.",
        "**The reason, or the lack of one.** When a move has a confirmed reason we give it with the source. When it does not, the item shows the move and its next step, with no reason line. See [Reasons for a move](/docs/briefing/reasons).",
        "**A next step.** Something to read or check. It is never an instruction to buy or sell.",
        "**Evidence.** Each line names who it comes from and the date or time it refers to, with a link when there is one.",
      ),
      h2("What to do with an item"),
      p(
        "Mark it **Got it** to clear it, or **Keep watching** to hold it in its own list. Either way the item is kept, not deleted. See [Got it, keep watching and history](/docs/briefing/item-state).",
      ),
      warn(
        "The briefing reads the positions you typed in. If you sold something and did not update the app, the briefing will keep telling you about it.",
        "It only knows what you told it",
      ),
    ],
    related: ["briefing/sections", "briefing/reasons", "briefing/item-state"],
  },
  {
    section: "start",
    slug: "read-a-stock-report",
    title: "How to read a stock report",
    summary: "The report runs from the call at the top to the raw evidence below it. Every panel names its source and the time it is from.",
    updated: REVISED,
    surface: { label: "Search a stock", href: "/explore" },
    blocks: [
      p(
        "Each covered stock has one report at `/stock/TICKER`. It is laid out so the conclusion comes first and the evidence for it follows. Read it top to bottom once, then use the section rail to jump.",
      ),
      h2("The top: price, call and what changed"),
      ul(
        "**Price panel.** The latest published price, the day's change and a chart. The time under it is the time of that price, not the time you opened the page.",
        "**Our call.** One of add, hold, trim, watch or avoid, with a confidence and a horizon. The call, its reason and its date are shown to every reader, signed out included. Next to it are the price zones: **Add below**, **Trim above**, and **Add above** when the call is waiting for a breakout. The zones and what would change the call are shown on Pro, on the stocks a Free account follows, and to everyone on a small set of showcase stocks. See [How calls and zones are produced](/docs/methodology/calls-and-zones).",
        "**The read.** A short written explanation of the call: what is driving the stock and what the main risk is. This text is written by a model from the sources attached to it. See [What a model writes](/docs/methodology/model-written-vs-computed).",
        "**What changed.** The dated changes since the previous read, so you can see why today's call differs from last week's.",
      ),
      h2("The business"),
      ul(
        "**What it does** and **In plain numbers**: the company in a paragraph, then revenue, profit and cash in ordinary words.",
        "**Key figures**, **Revenue by business** and **Revenue by region** where the company reports them.",
        "**Margins** and **Cash and debt** from the latest statements.",
      ),
      h2("Valuation and analysts"),
      ul(
        "**Multiples** and **P/E against its own history**: whether the stock is expensive compared with itself, not only with others.",
        "**Analyst price targets** and **ratings by month**. These are other people's opinions. We show the range and how it moved.",
      ),
      h2("Earnings"),
      ul(
        "**Next report**: the date and the estimates.",
        "**Going in**: what the report has to show, written before the date. This pre-earnings read is shown under the same rule as the zones. The date and the estimates are shown for every stock.",
        "**Earlier report dates** with the result against expectations, the guidance and the price reaction when we hold them.",
      ),
      h2("Who owns it and who is trading it"),
      ul(
        "**Funds we follow**: which of the funds on [Follow](/follow) hold it, from their latest 13F. A 13F is a quarter-end snapshot filed up to 45 days later. See [What a 13F is](/docs/follow/what-a-13f-is).",
        "**Congress** and **Insiders**: disclosed trades with the trade date and the filing date side by side.",
        "**Largest institutional holders.**",
      ),
      h2("News and the crowd"),
      p(
        "Recent headlines with the publisher and time, and what is being said on Reddit when the stock is being discussed. Headlines are the publisher's own words. We do not rewrite them.",
      ),
      h2("Trend and returns"),
      p(
        "Moving averages, the 14-day RSI and returns over standard windows, computed from daily closes. These are arithmetic, not opinion.",
      ),
      note(
        "A panel that has no data is left out. If a section you expect is missing, it means we do not hold that data for the stock, not that the value is zero.",
        "Missing panels",
      ),
    ],
    related: ["methodology/calls-and-zones", "methodology/data-sources", "research/compare"],
  },
  {
    section: "start",
    slug: "free-vs-pro",
    title: "Free vs Pro",
    summary: "Reading is free. Having the agent work for you across everything you own is Pro. The table below is the one the product enforces.",
    updated: REVISED,
    surface: { label: "See pricing", href: "/pricing" },
    blocks: [
      p(
        `Anything we write once for everyone is free to read: stock reports, our call on ${CALL_COVERAGE}, filings, fund pages, strategies and their caveats. What a plan changes is how much is done for you personally.`,
      ),
      h2("The one number that matters: covered stocks", "covered-stocks"),
      p(
        `Tracking is unlimited on Free and Pro: every holding and watched name gets its price, our call and its next earnings date. On Free, ${FREE_COVERED_STOCKS} of them are **covered**: they get price zones and what would change the call, explained moves in your briefing, and the pre-earnings read. Pro covers everything you track. Free keeps 5 price alerts by email; email alerts on zones and calls are Pro only.`,
      ),
      p(
        `Without a limit on changes, the ${FREE_COVERED_STOCKS} slots could be used to read zones across the whole market. So the first ${FREE_COVERED_STOCKS} stocks you cover are free picks, and after that covering a new stock is a swap, one a week. Uncovering is free any time, and putting back a stock you covered in the last seven days does not use the swap. When the swap is used, the app names the day the next one opens.`,
      ),
      p("A small set of showcase stocks shows its zones to everyone, signed out included, so you can see what coverage looks like before you use a slot."),
      h2("What is never behind a lock"),
      ul(
        "The call on a stock and when it was made. Every reader sees the same call at the same time.",
        "The source of a number and the time it is from.",
        "Risk notes, backtest caveats and methodology.",
        "Public filings.",
        "Your own data and its export.",
        "Cancelling.",
      ),
      h2("The full table"),
      p(
        "This table is rendered from the same file the product reads when it decides what to load for you. If a limit changes, this page changes with it.",
      ),
      { t: "entitlements" },
      note(
        "Three rows are ahead of the code that runs today. The weekly review email is sent to Pro accounts only. The daily market email goes to people who signed up for it, not to every Free account. And an account can hold 20 agents in total, so that is the working limit on Pro. See [The briefing by email](/docs/briefing/emails).",
        "Where the table and the code differ",
      ),
      h2("How a limit behaves"),
      ul(
        "**Covered stocks** means the feature works on the stocks your plan covers. On the others you still see the report and the call.",
        "**Counts** (followed stocks, followed investors, saved screens) stop you adding one more once you reach the limit. Agents are the exception: one created past the limit is saved switched off, and runs once you pause another.",
        "**Daily meters** (questions, backtests, API calls) count by UTC day, so they reset at midnight UTC. A backtest setup you already ran that day opens again without counting.",
        "**Depth limits** apply to backtests today. Free and signed-out runs look back five years and Pro tests every year we hold. A run that asks for more is moved to the five-year start and says so.",
      ),
      h2("Paying and cancelling"),
      p(
        `Pro is $${US_PRO_MONTHLY} a month or $${US_PRO_YEARLY} a year, billed through our payment provider, Dodo Payments. At US checkout, an account that has not had one before gets a 3-day trial, which asks for a card. You can cancel from [Account](/profile). Cancelling stops the next charge and you keep Pro until the period you paid for ends. See [Security](/security) for what we store about a payment.`,
      ),
    ],
    related: ["start/what-stocksbrew-is", "ask/what-it-will-not-do"],
  },
];
