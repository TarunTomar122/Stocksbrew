import { example, h2, note, p, table, ul, warn } from "@/lib/docs/build";
import type { Guide } from "@/lib/docs/types";
import { limitFor } from "@/lib/entitlements";

const UPDATED = "2026-11-09";
/** Guides whose facts were rechecked against the code and changed. */
const REVISED = "2026-11-10";
const SURFACE = { label: "Open Follow", href: "/follow" };

export const FOLLOW_GUIDES: Guide[] = [
  {
    section: "follow",
    slug: "what-a-13f-is",
    title: "What a 13F is, and its 45-day lag",
    summary: "A 13F is a quarter-end list of a manager's US-listed long positions, filed up to 45 days late. What that list can tell you and what it leaves out.",
    updated: REVISED,
    surface: SURFACE,
    blocks: [
      p(
        "Any institutional manager with more than $100 million in US-listed securities must file Form 13F with the SEC four times a year. It lists what the manager held on the last day of the quarter. Fund pages on [Follow](/follow) are built from these filings, read directly from SEC EDGAR back to the first quarter of 2013.",
      ),
      h2("What is on it"),
      ul(
        "US-listed stocks and ETFs held long, with the share count and the value on the quarter's last day.",
        "Listed options, reported as puts or calls on an underlying. We show these apart from the stock positions and leave them out of the record.",
        "Some convertible bonds and warrants.",
      ),
      h2("What is not on it"),
      ul(
        "**Short positions.** A fund can be net short a stock it shows as a holding.",
        "**Cash**, so you cannot tell how invested the fund is.",
        "**Foreign-listed stocks, bonds, private holdings, swaps and futures.**",
        "**Prices paid or dates traded.** Only the quarter-end snapshot.",
        "**Anything that changed after the quarter ended.**",
      ),
      h2("The 45-day lag"),
      p(
        "A 13F is due within 45 days of the quarter's end, and most funds file on or near the deadline. By the time you can read it, the newest trade in it is at least six weeks old and the oldest is more than four months old.",
      ),
      example(
        "A timeline",
        "Jul 3: the fund buys a stock.",
        "Sep 30: quarter ends. The position is in the snapshot.",
        "Nov 14: the 13F is filed. This is the first day the public can know.",
        "Lag from trade to disclosure: 134 days.",
      ),
      p("Every fund page shows the quarter a filing reports on, the date it was filed and the lag in days, so the age of what you are reading is never hidden."),
      h2("How we read a filing"),
      ul(
        "Positions are identified by CUSIP in the filing. We map each CUSIP to a ticker through OpenFIGI. A position we cannot map is shown by name and counted as unmapped.",
        "Weights are each stock position's value over the total of stock positions. Options are excluded from the weights.",
        "Changes compare this quarter's share counts with the previous filing: new, added, reduced, sold or held.",
        "An amended filing (13F-HR/A) replaces the original for that quarter and is marked as amended.",
        "We read a fixed list of funds, not every 13F filer. A fund outside the list has no page, and a fund on it has a record only once its filings have been read.",
      ),
      warn(
        "A 13F shows what a fund held, not why, and not what it holds now. A position that looks like conviction can be half of a pair trade whose other half is not reportable.",
        "A snapshot, not a strategy",
      ),
    ],
    related: ["follow/filing-date-performance", "research/filings", "methodology/data-sources"],
  },
  {
    section: "follow",
    slug: "filing-date-performance",
    title: "How filing-date performance is measured",
    summary: "Every record on Follow starts on the day a filing became public, not the day of the trade. Here is the exact portfolio behind the number and why we measure it that way.",
    updated: UPDATED,
    surface: SURFACE,
    blocks: [
      p(
        "The return shown for a fund or a member of Congress is not their own performance. It is the performance of a portfolio that anyone could have run by acting on their public filings. Nobody ran it. It is a way to ask whether following the disclosures would have been worth anything.",
      ),
      h2("The portfolio, step by step"),
      ul(
        "Take each filing in order of the date it was **filed**.",
        "On the first trading session on or after that filing date, set the portfolio to the stock positions disclosed in the filing, at the weights in the filing.",
        "Hold those weights until the next filing, then repeat.",
        "Value the portfolio each day from daily closes adjusted for splits and dividends.",
        "Compare it with SPY, the S&P 500 fund, bought on the same first day and held, dividends included.",
      ),
      h2("Why not from the trade date"),
      p(
        "Measuring from the trade date credits the follower with gains made before the trade was public. A fund that bought in July and disclosed in November may already be up 30% by the time you can read about it. A record from the trade date would show that 30%. A follower could never have earned it.",
      ),
      example(
        "The same position, two ways of measuring",
        "Bought Jul 3 at $100. Disclosed Nov 14, when the price was $130. Today $143.",
        "From the trade date: +43%.",
        "From the filing date: +10%. This is what following the disclosure could have captured.",
      ),
      p("So every record starts at the first filing we hold and uses filing dates throughout. The numbers are lower and more honest."),
      h2("The windows"),
      table(
        ["Column", "Meaning"],
        [
          ["1M, 3M, 1Y", "Return of the follow portfolio over the last month, three months and year."],
          ["YTD", "Return since the first session of this calendar year."],
          ["Since first filing", "Return since the first filing date we hold for that source."],
          ["Annualised", "The since-first-filing return expressed per year."],
          ["Max drawdown", "The largest fall from a previous high over the whole record."],
          ["vs S&P 500", "The same window for SPY, shown next to each figure."],
        ],
      ),
      p("A window shows nothing when the record is shorter than the window. We do not stretch a three-month record to fill a one-year column."),
      h2("Covered weight"),
      p(
        "Some disclosed positions have no price series we can use, for example a delisted stock or an unmapped CUSIP. Those are dropped and the rest are scaled up to 100%. The share of the filing that could be priced is the **covered weight**, and it is stored next to every record. A record with 70% covered weight is describing 70% of the portfolio.",
      ),
      h2("What the record leaves out"),
      ul(
        "Trading costs and taxes. Each filing change is assumed to trade for free.",
        "Everything a 13F does not show: shorts, cash, options, foreign holdings.",
        "For Congress, the size of each trade. Reports give a dollar range, so each buy is counted at the middle of its range.",
        "Whatever the person held before the first report we read.",
      ),
      warn(
        "A long follow record that beats the index mostly tells you the manager's picks kept working months after they were made. It does not tell you the next filing will.",
        "Reading a good record",
      ),
    ],
    related: ["follow/what-a-13f-is", "follow/congress", "strategies/how-the-numbers-are-computed"],
  },
  {
    section: "follow",
    slug: "congress",
    title: "Congress disclosures and the STOCK Act windows",
    summary: "What members of Congress must report, how late a report can be, why amounts are ranges, and which reports we can and cannot read.",
    updated: UPDATED,
    surface: SURFACE,
    blocks: [
      p(
        "Under the STOCK Act of 2012, members of Congress must publicly report trades in stocks, bonds and similar assets made by themselves, their spouse or a dependent child. The report is called a periodic transaction report, or PTR.",
      ),
      h2("The two deadlines"),
      ul(
        "Within **30 days** of learning about the transaction, and",
        "no later than **45 days** after the transaction itself.",
      ),
      p("So a compliant report can still describe a trade six weeks old. We mark a trade as late when it was reported more than 45 days after it was made, and each member's page shows their median lag and their count of late trades."),
      h2("Amounts are ranges"),
      p("A PTR never gives an exact amount. It gives a bracket:"),
      table(
        ["Bracket", "Counted as"],
        [
          ["$1,001 to $15,000", "$8,000"],
          ["$15,001 to $50,000", "$32,500"],
          ["$50,001 to $100,000", "$75,000"],
          ["$100,001 to $250,000", "$175,000"],
          ["$250,001 to $500,000", "$375,000"],
          ["$500,001 to $1,000,000", "$750,000"],
          ["$1,000,001 to $5,000,000", "$3,000,000"],
        ],
        "Larger brackets exist and are handled the same way: the middle of the range.",
      ),
      p("We always show the bracket as filed. The midpoint is used only where a single number is unavoidable, such as weighting the follow portfolio, and it is labelled as an estimate."),
      h2("What we read"),
      ul(
        "**House of Representatives.** The Clerk of the House publishes each electronically filed PTR as a PDF. We read those from 2023 onward and rebuild the transaction table from the text.",
        "**Scanned paper filings** have no text to read. They are counted in each run and their trades are not in our data.",
        "**Senate.** Senators file in a separate system that we do not read for Follow yet, so senators have no profile or record here.",
      ),
      h2("Each trade shows"),
      ul(
        "The member, the asset and whether it was a purchase or a sale, including partial sales.",
        "The owner: the member, their spouse, a dependent child or a joint account.",
        "The transaction date and the disclosure date side by side, with the lag in days.",
        "A link to the filed report.",
      ),
      h2("The record"),
      p(
        "A member's record is a follow-the-disclosure portfolio: on the first session on or after each filing date it holds the stocks the member has disclosed buying and has not yet disclosed selling. See [How filing-date performance is measured](/docs/follow/filing-date-performance).",
      ),
      warn(
        "A disclosed trade is legal and tells you nothing about what the member knew. Many are made by a spouse or an adviser. We report the filings. We do not suggest motive.",
        "What a disclosure is not",
      ),
    ],
    related: ["follow/filing-date-performance", "follow/insiders", "agents/triggers"],
  },
  {
    section: "follow",
    slug: "insiders",
    title: "Form 4 insiders and cluster buys",
    summary: "Who counts as an insider, which of their trades we keep, and what three insiders buying in the same month does and does not mean.",
    updated: REVISED,
    surface: SURFACE,
    blocks: [
      p(
        "A company's officers, its directors and anyone who owns more than 10% of it must report trades in the company's stock on SEC Form 4, within two business days. Of everything on Follow, this is the freshest disclosure.",
      ),
      h2("Which trades we keep"),
      table(
        ["Code", "Meaning", "Kept"],
        [
          ["P", "Open-market purchase", "Yes"],
          ["S", "Open-market sale", "Yes"],
          ["A", "Grant or award", "No"],
          ["M", "Option exercise", "No"],
          ["F", "Shares withheld for tax", "No"],
          ["G", "Gift", "No"],
        ],
      ),
      p("We keep only trades where a person chose to buy or sell at a market price. A grant or a tax withholding is not a decision about the stock's value."),
      h2("Buys and sells are not symmetric"),
      ul(
        "Insiders sell for many reasons: tax, a house, diversification, a pre-arranged plan. A sale on its own says little.",
        "Insiders buy with their own money for one reason: they expect the stock to be worth more.",
        "A sale made under a Rule 10b5-1 plan was scheduled in advance. The filing says so and we carry that flag.",
      ),
      h2("Cluster buys"),
      p("We flag a cluster when **three or more different insiders** make open-market purchases of the same stock **within 30 days**. One cluster is kept per stock, dated from the first purchase to the latest."),
      ul(
        "Several people with inside knowledge of the same company reaching the same conclusion with their own money is harder to explain away than one purchase.",
        "It is still not a forecast. Insiders can be early by a year, and they can be wrong.",
        "Check the sizes. Three directors buying $10,000 each is a gesture. A chief executive buying $2 million is a position.",
      ),
      h2("Coverage"),
      ul(
        "Form 4 filings for the US stocks we cover, over a rolling window of recent weeks.",
        "Each row shows the insider, their role, shares, price, value, the transaction date and the filing date.",
        "Read from SEC EDGAR. The link goes to the filing.",
      ),
      note(`Reading Follow is free on every plan: full portfolios, every filing we hold and the record. Free follows ${limitFor("followed_sources", "free")} investors and Pro has no limit. Following saves the investor to your account. It does not send an email when they file. For that, an [agent](/docs/agents/triggers) can watch for new filings and report in the app.`),
    ],
    related: ["research/filings", "follow/congress", "agents/triggers"],
  },
];
