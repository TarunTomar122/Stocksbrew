import { example, h2, note, p, table, ul, warn } from "@/lib/docs/build";
import type { Guide } from "@/lib/docs/types";
import { limitFor } from "@/lib/entitlements";

const UPDATED = "2026-11-09";
/** Guides whose facts were rechecked against the code and changed. */
const REVISED = "2026-11-10";
const SURFACE = { label: "Open Agents", href: "/agents" };

export const AGENTS_GUIDES: Guide[] = [
  {
    section: "agents",
    slug: "triggers",
    title: "Agents and their triggers",
    summary: "An agent is a standing job: one rule, checked for you on a schedule, an event or a price. The ten templates and exactly when each one reports.",
    updated: REVISED,
    surface: SURFACE,
    blocks: [
      p(
        "An agent is a rule you set up once. It is checked at most once per market day and the result is written down. It has one mode: tell me. An agent never places a trade and cannot be given permission to.",
      ),
      h2("What an agent is made of"),
      ul(
        "**A trigger**: what wakes it. A schedule, an event or a price rule.",
        "**A scope**: which names it looks at. Everything you track when it runs, a fixed list of up to 25 tickers, or any name at all for filings and disclosures.",
        "**A name**, so you can tell them apart in the run log.",
      ),
      h2("Schedule triggers"),
      table(
        ["Template", "Reports"],
        [
          ["Morning check", "Every market day: which of your names moved 3% or more, which report earnings soon and who disclosed a trade in them."],
          ["Weekly review", "Once a week on a weekday you choose: the same for the week, with a 5% threshold for moves."],
        ],
      ),
      h2("Event triggers"),
      table(
        ["Template", "Reports when"],
        [
          ["A fund files a 13F", "A fund we follow files, and whether the filing touched your names."],
          ["Congress discloses a trade", "A House member discloses a trade in one of your names. Dated by the disclosure, which is when anyone could have known."],
          ["An insider trades", "An officer or director reports an open-market buy or sale in one of your names."],
          ["Earnings are coming", "One of your names reports within the number of days you set."],
          ["One of my names is a mover", "One of your names is on the day's list of unusual movers, with the reason if we found one."],
        ],
      ),
      h2("Price triggers"),
      table(
        ["Template", "Reports when"],
        [
          ["Crosses a level", "A stock closes above or below a price you choose, having been on the other side at the previous close."],
          ["Moves a lot in a day", "One of your names closes up or down more than a percent you set."],
          ["Drops into its add zone", "One of your names closes at or below the add level from its current call."],
        ],
      ),
      h2("How a check works"),
      ul(
        "Each agent is evaluated once per market day. Running it twice in a day changes nothing.",
        "Checks do not run at a fixed clock time yet. Each line in the run log shows when it ran.",
        "A check only reads facts dated on or before the day it is checking.",
        "Price rules use daily closes. A level touched during the day and lost by the close does not count.",
        "Event rules look at everything since the agent's last check, so a filing made over a weekend is picked up on Monday.",
        "A run reports at most eight findings, the most relevant first.",
      ),
      h2("The four-week replay"),
      p("Before you start an agent we run it over the last four weeks of sessions and show you what it would have reported each day. Each replayed day sees only what was dated on or before it. The replay tells you whether the rule is too noisy or too quiet before you live with it."),
      ul(
        "It is a replay, not a record. Nothing was sent.",
        "It uses the names you track today, not your list as it was four weeks ago.",
        "The add-zone rule is replayed against today's add level, because we do not keep past levels.",
        "Earnings dates are the ones on the calendar today. A date that moved shows where it ended up.",
      ),
      note(`Free runs ${limitFor("agents", "free")} agents at a time and every template is available on both plans. Pro runs more: the plan allows ${limitFor("agents", "pro")} and an account can hold 20 agents in total today. An agent created past your limit is saved switched off and starts once you pause another. Results are delivered in the app only. See [Free vs Pro](/docs/start/free-vs-pro).`),
    ],
    related: ["agents/run-log", "agents/did-nothing-is-a-result", "portfolio/alerts"],
  },
  {
    section: "agents",
    slug: "run-log",
    title: "The run log",
    summary: "Every check an agent makes is written down with its decision, what it looked at and where each finding came from.",
    updated: REVISED,
    surface: SURFACE,
    blocks: [
      p("The run log is the agent's record. There is one line per agent per market day, and each line ends in one of three decisions."),
      table(
        ["Decision", "Shown as", "Meaning"],
        [
          ["notify", "Told you", "The rule was met. The run lists what was found."],
          ["nothing", "Nothing to do", "The rule was checked and was not met."],
          ["could_not_check", "Could not check", "We did not have the data to check the rule that day."],
        ],
      ),
      h2("What a run records"),
      ul(
        "**The day** it evaluated and the time it ran.",
        "**A summary**: one sentence you can read on its own.",
        "**Findings**, when there are any. Each has a headline, a detail line, the source, a link when there is one, and the date the fact is from.",
        "**What it checked**: the names and the sources it looked at. This is filled in for every decision, so a quiet day still shows its work.",
        "**The newest closing price date it read**, for price rules, so you can tell whether it was working from today's close or an older one.",
      ),
      example(
        "Three lines from one agent",
        "Nov 5, Told you: NVDA closed at $148.20, above your level of $145.",
        "Nov 6, Nothing to do: NVDA closed at $147.10. It was already above $145 at the previous close.",
        "Nov 7, Could not check: no closing price for NVDA on Nov 7 yet.",
      ),
      h2("Where results show up"),
      ul(
        "In the agent's own log on [Agents](/agents).",
        "In the [Briefing](/briefing), as an item, when the decision was Told you.",
        "Agents do not send emails. Results are delivered in the app only. On Pro, use an [alert](/docs/portfolio/alerts) if you need an email for a price level.",
      ),
      h2("Pausing and removing"),
      p("A paused agent keeps its log and stops being checked. Removing an agent archives it. Past runs stay in the log so the record is not rewritten."),
      warn("A run log line never contains your email address or account id. Lines are keyed to the agent.", "What is not in the log"),
    ],
    related: ["agents/did-nothing-is-a-result", "agents/triggers", "start/read-a-briefing"],
  },
  {
    section: "agents",
    slug: "did-nothing-is-a-result",
    title: "Why \"did nothing\" is a result",
    summary: "An agent that only speaks when something happens cannot be told apart from one that is broken. So every check is recorded, and not knowing is kept separate from nothing happening.",
    updated: UPDATED,
    surface: SURFACE,
    blocks: [
      p("Most alerting tools are silent until they fire. That leaves you with a question you cannot answer: is it quiet because nothing happened, or because it stopped working?"),
      h2("Three states, never merged"),
      ul(
        "**Told you.** The rule was met.",
        "**Nothing to do.** We looked, with the data we needed, and the rule was not met. This is a positive statement.",
        "**Could not check.** We did not have the data. This is a statement about us, not about the stock.",
      ),
      p("The last two are easy to confuse and we keep them apart on purpose. If the House has not published a report we can read, an agent watching Congress says it could not check. It does not say no member traded."),
      h2("Why it matters"),
      ul(
        "**You can trust the silence.** A week of Nothing to do lines means seven checks were made.",
        "**You can see a broken source.** A run of Could not check lines points at a data problem, and it points at it on the day it starts.",
        "**You can tune the rule.** If an agent says Nothing to do for three months, the threshold may be too far away to be useful. If it reports every day, it is too close.",
        "**Nothing is rewritten afterwards.** One line per day, written that day.",
      ),
      h2("What the agent looked at"),
      p("Every run lists what it checked: which names and which sources. A Nothing to do line that says it checked 12 names against the movers list for Nov 6 is something you can verify. A blank is not."),
      note("The same idea runs through the product. The briefing has a Quiet list for names that were checked and had nothing, and a missing number is left empty instead of being shown as zero."),
    ],
    related: ["agents/run-log", "briefing/sections", "methodology/data-sources"],
  },
];
