import { h2, note, p, table, ul, warn } from "@/lib/docs/build";
import type { Guide } from "@/lib/docs/types";

const UPDATED = "2026-11-09";
/** Guides whose facts were rechecked against the code and changed. */
const REVISED = "2026-11-10";
const SURFACE = { label: "Open the Briefing", href: "/briefing" };

export const BRIEFING_GUIDES: Guide[] = [
  {
    section: "briefing",
    slug: "sections",
    title: "Needs you, worth knowing, coming up, quiet",
    summary: "How an item lands in each part of the briefing, and why the quiet list is there at all.",
    updated: UPDATED,
    surface: SURFACE,
    blocks: [
      p(
        "Every item in the briefing is built from one dated fact: a price move, a changed call, an earnings date, a filing, a headline. Each one gets a severity and a flag for whether it needs you. That flag, not the order things happened in, decides where it appears.",
      ),
      h2("What can become an item"),
      table(
        ["Kind", "What triggers it"],
        [
          ["Price move", "A holding or watched name on the day's list of unusual movers."],
          ["Call changed", "Our call on the stock is different from the previous one, for example hold to trim."],
          ["Zone entered", "The price closed inside the add zone or the trim zone from the current call."],
          ["Earnings upcoming", "A report date inside the next seven days."],
          ["Earnings reported", "The company reported, with the result against expectations when we hold it."],
          ["Alert triggered", "One of your price alerts fired."],
          ["Congress trade", "A member of the House disclosed a trade in one of your names."],
          ["News", "A headline that names the stock."],
          ["Discussion spike", "Unusual volume of Reddit discussion about the stock."],
          ["Filing", "A new SEC filing for the company."],
          ["Technical", "A reading such as RSI reaching an extreme."],
          ["Agent run", "One of your agents reported something."],
        ],
      ),
      h2("Needs you"),
      p(
        "An item is marked as needing you when it is both about something you hold or watch and large or close enough to matter: a high-severity move in a holding, a changed call, a zone entered, a fired alert, earnings in the next day or two. Holdings rank above watched names, and larger positions rank above smaller ones.",
      ),
      h2("Worth knowing"),
      p("Everything else that happened to your names and is still open. Reading it is optional. Nothing here is urgent by our rules."),
      h2("Coming up"),
      p(
        "Dated events in the next seven days that do not need a decision yet, soonest first. An earnings report three days out sits here. The same report tomorrow morning moves to Needs you.",
      ),
      h2("Quiet"),
      p(
        "The names on your account where nothing happened today, with their day change. It is short on purpose. The point is that a name missing from the lists above was checked and had nothing, which is different from not being checked.",
      ),
      note(
        "If nothing needs you, the page says so in its first line and shows the market view underneath. An empty Needs you list is the normal state on most days.",
        "Nothing needs you today",
      ),
    ],
    related: ["start/read-a-briefing", "briefing/reasons", "agents/did-nothing-is-a-result"],
  },
  {
    section: "briefing",
    slug: "reasons",
    title: "When we give a reason for a move",
    summary: "A price move gets a reason only when research found one in dated sources. Otherwise the move shows with its number and no reason line.",
    updated: REVISED,
    surface: SURFACE,
    blocks: [
      p(
        "Most daily price moves have no single cause, and the ones that do are easy to get wrong. So each move in the briefing carries one of three states.",
      ),
      table(
        ["State", "What you see", "What it means"],
        [
          ["Confirmed", "The reason, with the source and its date", "A research pass found a dated source that explains the move: results, guidance, a filing, a rating change, a deal."],
          ["Unconfirmed", "The stock and its move, with no reason line", "We looked and did not find one, or we have not researched the move yet."],
          ["Not applicable", "No reason line", "The item is not a price move, for example an earnings date."],
        ],
      ),
      h2("How a reason gets confirmed"),
      ul(
        "We take the largest unusual movers of a session and research them against recent news and filings. A mover that has not been researched yet is marked as pending.",
        "The explanation is written by a model, and it is only kept when it is backed by the attached sources. See [What a model writes](/docs/methodology/model-written-vs-computed).",
        "Only the largest movers are researched each pass. A smaller move in one of your names will often show as unconfirmed for that reason alone.",
      ),
      h2("How to use an unconfirmed move"),
      p(
        "Treat it as a prompt to look, not as a signal. Open the stock report, check the latest headlines and filings, and see whether the whole sector moved the same way. A stock falling 4% with its sector down 3% has mostly told you about the sector.",
      ),
      warn(
        "A confirmed reason explains what was reported. It does not tell you whether the market's reaction was right.",
        "A reason is not a verdict",
      ),
    ],
    related: ["research/signals", "methodology/model-written-vs-computed"],
  },
  {
    section: "briefing",
    slug: "item-state",
    title: "Got it, keep watching and history",
    summary: "What the two buttons on an item do, what is saved, and how far back you can look.",
    updated: REVISED,
    surface: SURFACE,
    blocks: [
      p("Each open item has two actions. Both are saved to your account, so the briefing looks the same on your phone and your laptop."),
      table(
        ["Action", "What happens"],
        [
          ["Got it", "The item leaves the open lists and moves to a dismissed list at the bottom. It is not deleted."],
          ["Keep watching", "The item moves to a Kept list so it stays in front of you after today."],
          ["Undo", "Either action can be reversed, which puts the item back where it was."],
        ],
      ),
      h2("What is saved"),
      ul(
        "The item's id for that day, the state you chose and the time you chose it. Nothing else.",
        "An item's id is stable for the day: the same event produces the same id, so a reload or a rebuilt briefing does not lose your state.",
        "State is kept for seven days of briefings. Older days drop off.",
      ),
      h2("Ask why"),
      p(
        "**Ask why** on an item opens [Ask](/ask) with the question already filled in. Ask follows the same sourcing rules as everything else, and a question counts against your daily allowance. See [How sources work](/docs/ask/how-sources-work).",
      ),
      note("Marking an item Got it does not change any alert, agent or holding. It only records that you have seen it."),
    ],
    related: ["start/read-a-briefing", "briefing/sections"],
  },
  {
    section: "briefing",
    slug: "emails",
    title: "The briefing by email",
    summary: "Which emails exist, who gets each one today, and how to turn them off.",
    updated: REVISED,
    surface: { label: "Email settings", href: "/profile#notifications" },
    blocks: [
      p("The app is the full briefing. Email is a shorter copy of it for people who would rather not open the app every day."),
      table(
        ["Email", "What it is", "Who gets it"],
        [
          ["Daily market email", "The market as a whole", "Anyone who signed up for it. It does not need an account"],
          ["Weekly review", "The week on your stocks", "Pro"],
          ["Your own briefing, before the open", "Your stocks before the US market opens", "Pro"],
          ["Your own briefing, at the open", "Your stocks once the opening prices have settled", "Pro"],
          ["Alerts", "One of your alerts fired", "Pro. See [Alerts](/docs/portfolio/alerts)"],
        ],
      ),
      p("On Free, your own briefing is read in the app. This page gives no send times, because none is fixed yet."),
      h2("Turning them off"),
      ul(
        "[Account](/profile#notifications) has two switches: **Market briefs** controls your own briefing and the weekly review, **Alerts** controls alert emails. Both are on by default.",
        "The daily market email goes to a separate sign-up list and is not controlled by these switches. To stop it, write to the address on [Corrections](/docs/methodology/corrections#reporting-an-error).",
        "The switches are the way to stop an email. They take effect from the next send.",
        "Turning an email off does not change the briefing in the app.",
      ),
      note("We do not send texts or push notifications. Email is the only channel today."),
    ],
    related: ["portfolio/alerts", "start/free-vs-pro"],
  },
];
