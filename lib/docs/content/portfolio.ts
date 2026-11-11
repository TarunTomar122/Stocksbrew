import { example, h2, note, p, table, ul, warn } from "@/lib/docs/build";
import type { Guide } from "@/lib/docs/types";
import { FREE_COVERED_STOCKS, limitFor } from "@/lib/entitlements";

const UPDATED = "2026-11-09";
/** Guides whose facts were rechecked against the code and changed. */
const REVISED = "2026-11-10";
const SURFACE = { label: "Open Portfolio", href: "/watchlist" };

export const PORTFOLIO_GUIDES: Guide[] = [
  {
    section: "portfolio",
    slug: "adding-holdings",
    title: "Adding holdings",
    summary: "The difference between holding and watching, what to enter for a holding, and what the product does with it.",
    updated: REVISED,
    surface: SURFACE,
    blocks: [
      p(
        "Your portfolio in stocksbrew is a list you keep by hand. We do not connect to a brokerage, so nothing arrives or updates on its own. That is a limit, and it is also why we never hold a credential that could move your money.",
      ),
      h2("Holding or watching"),
      table(
        ["", "Holding", "Watching"],
        [
          ["What it means", "You own it", "You are following it"],
          ["What you enter", "Shares and average cost, or a market value", "Nothing"],
          ["In the briefing", "Ranked first, with the size of the position", "Ranked after holdings"],
          ["In analytics", "Counted", "Not counted"],
        ],
      ),
      h2("What to enter for a holding"),
      ul(
        "**Shares.** How many you own. Fractions are fine.",
        "**Average cost.** What you paid per share on average. This is what gain and loss are measured from.",
        "**Market value**, if you would rather give a dollar amount than a share count.",
      ),
      p(
        "A holding without a size is still tracked and still appears in the briefing. It just cannot be added into your day's change or your allocation, and the page tells you how many holdings were counted.",
      ),
      h2("Ways to add"),
      ul(
        "From a stock report: the **Track it** panel.",
        "From search inside Portfolio: each result has hold and watch controls.",
      ),
      h2("How many you can track"),
      p(
        `Tracking has no limit on any plan: holdings and watched names together, each with its price, our call and the next earnings date. Free **covers** ${FREE_COVERED_STOCKS} of them in full (price zones, the whole brief, how the call has moved, the pre-earnings read). Your first ${FREE_COVERED_STOCKS} tracked stocks are covered as you add them; after that you choose under **Covered in full** at the top of Portfolio, with one swap a week. Uncovering is free any time, and the app names the day your next swap opens. Pro covers everything you track. See [Free vs Pro](/docs/start/free-vs-pro#covered-stocks).`,
      ),
      h2("Keeping it current"),
      p(
        "When you buy or sell somewhere else, edit the holding here. Changing a holding to zero or removing it stops the briefing from reporting on it. Research on a newly added stock that we had not covered before is queued, and the report says so until it is ready.",
      ),
      warn(
        "The numbers on this page are only as right as what you typed. We cannot see corporate actions on your account, cash balances, options or anything held outside this list.",
        "This is not a statement of your account",
      ),
    ],
    related: ["portfolio/analytics", "start/read-a-briefing", "start/free-vs-pro"],
  },
  {
    section: "portfolio",
    slug: "analytics",
    title: "Portfolio analytics",
    summary: "What the analytics tab works out from your holdings, how each figure is computed and what it leaves out.",
    updated: REVISED,
    surface: SURFACE,
    blocks: [
      p(
        "Analytics looks at your holdings as one portfolio. It uses the sizes you entered and the latest published prices. Watched names are not included.",
      ),
      h2("What it shows"),
      table(
        ["Figure", "How it is computed"],
        [
          ["Value", "Shares times the latest price, summed over holdings that have both."],
          ["Day change", "Each holding's value times its day change, summed, then divided by the previous value."],
          ["Gain or loss", "Latest price against your average cost, per holding and in total."],
          ["Allocation", "Each holding's value as a share of the total, and the same grouped by sector."],
          ["Concentration", "The weight of your largest holding and of your top few together."],
          ["Against the S&P 500", "Your holdings' return over a window next to the index over the same window."],
        ],
      ),
      example(
        "Day change, worked",
        "Holding A: 20 shares at $150, up 2.0% today. Value $3,000, change +$58.82.",
        "Holding B: 10 shares at $400, down 1.0% today. Value $4,000, change −$40.40.",
        "Portfolio: $7,000 today, $6,981.58 yesterday. Change +$18.42, or +0.26%.",
      ),
      h2("How to read concentration"),
      p(
        "There is no correct number. A top holding at 40% means one earnings report can move your whole portfolio. Whether that is acceptable is yours to decide. The figure is there so the decision is deliberate.",
      ),
      h2("What it leaves out"),
      ul(
        "Cash, options, bonds, funds we do not cover and anything in an account you did not enter.",
        "Dividends you received and taxes you paid.",
        "The dates you bought. Without them we cannot compute a true time-weighted return, so the comparison with the S&P 500 is of the holdings as they stand today, not of your actual history.",
        "A tax view. We do not compute harvestable losses or wash-sale windows.",
      ),
      note("Analytics is free and counts every holding on your account, covered or not."),
    ],
    related: ["portfolio/adding-holdings", "tools/position-size", "strategies/how-the-numbers-are-computed"],
  },
  {
    section: "portfolio",
    slug: "alerts",
    title: "Alerts",
    summary: "Alerts arrive by email. The kinds of alert, when each one fires, and what Free includes.",
    updated: REVISED,
    surface: SURFACE,
    blocks: [
      p(`An alert is a rule on one stock that sends you an email when it becomes true. You set one on the stock report or from Portfolio. Free keeps ${limitFor("price_alerts", "free")} price alerts; the other kinds are part of Pro.`),
      h2("Kinds"),
      table(
        ["Alert", "Fires when"],
        [
          ["Price level", "A published price is above or below the level you set."],
          ["Call changed", "Our call on the stock changes, for example hold to trim."],
          ["Earnings in 24 hours", "The company reports within the next day."],
          ["Unusual move", "The stock lands on the day's list of unusual movers."],
          ["RSI extreme", "The 14-day RSI reaches an overbought or oversold extreme."],
          ["News burst", "Many more headlines than usual name the stock."],
        ],
      ),
      h2("How a price alert behaves"),
      ul(
        "It is checked when the alert job runs, against the latest fetched price. It is not checked continuously.",
        "A price that crosses your level and comes back between two checks will not fire the alert.",
        "You can keep several price levels on one stock. Setting exactly the same alert twice is refused instead of creating a duplicate.",
        "Deleting an alert deactivates it. It stops firing straight away.",
      ),
      h2("Delivery"),
      p(
        "Alerts arrive by email at the address on your Google account. Fired alerts also appear in the briefing under Needs you. The **Alerts** switch in [Account](/profile#notifications) turns alert emails off without deleting the alerts.",
      ),
      h2("On Free"),
      p(
        `Free keeps ${limitFor("price_alerts", "free")} price alerts by email. A fired alert frees its slot. The other kinds (a stock reaching our level, a changed call, earnings coming up) are Pro; on Free the same events appear in your briefing and morning email for your covered stocks.`,
      ),
      h2("Alerts or an agent"),
      p(
        "Use an alert for one condition on one stock. Use an [agent](/docs/agents/triggers) when you want the same check across everything you hold, or when you want a written record of every check, including the days nothing happened.",
      ),
      warn(
        "An alert is a reminder to look. It is not an order and it cannot become one. Prices are not real time and alerts are checked in batches, so do not use an alert as a stop-loss.",
        "Not a stop-loss",
      ),
    ],
    related: ["agents/triggers", "briefing/emails", "methodology/data-sources"],
  },
  {
    section: "portfolio",
    slug: "practice-account",
    title: "The practice account",
    summary: "A paper account with $100,000 of pretend money. How orders fill, what is compared with what, and how it differs from real trading.",
    updated: REVISED,
    surface: { label: "Open the practice account", href: "/practice" },
    blocks: [
      p(
        "The practice account lets you try an idea and see how it would have gone, without real money. Every signed-in account gets one, free. It is kept apart from your real holdings and never mixes into your briefing or analytics.",
      ),
      h2("The rules"),
      table(
        ["Rule", "Detail"],
        [
          ["Starting cash", "$100,000."],
          ["Order size", "A number of shares or a dollar amount. Fractional shares to four decimal places."],
          ["Fill price", "The latest stored daily close for the symbol. The trade record shows which session that price is from."],
          ["Fees", "None."],
          ["Selling", "You can sell what you hold. There is no short selling, margin or options."],
          ["Comparison", "The same $100,000 put into SPY at the close on the day your account started, and held."],
          ["Reset", "There is none. The account starts once and keeps its history."],
        ],
      ),
      h2("Reading the result"),
      ul(
        "**Account value** is cash plus each position at its latest close.",
        "**Return** is account value against $100,000.",
        "**Against SPY** is that return next to what the comparison line did over the same days.",
        "The trade log lists every fill with its price and the session date of that price.",
      ),
      h2("How it differs from a real account"),
      ul(
        "Real orders fill at the price available when you place them, which moves. Here you always get the last close, even on a day when the stock opened far from it.",
        "There is no bid-ask spread, no commission and no tax.",
        "You cannot run out of liquidity. A $50,000 order in a thinly traded stock fills in full here and would not in a market.",
        "Paper losses do not feel like real ones. How you would behave with real money is not something this can test.",
      ),
      note(
        "A practice record of a few weeks tells you very little. Read [What a backtest can and cannot tell you](/docs/strategies/what-a-backtest-tells-you) for why short records mislead.",
      ),
    ],
    related: ["strategies/what-a-backtest-tells-you", "strategies/running-your-own-backtest", "tools/position-size"],
  },
];
