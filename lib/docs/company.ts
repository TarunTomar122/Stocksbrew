import { h2, h3, note, p, table, ul, warn } from "@/lib/docs/build";
import { CONTACT_EMAIL } from "@/lib/docs/site";
import { CALL_COVERAGE } from "@/lib/brand-copy";
import type { Block } from "@/lib/docs/types";
import { US_PRO_MONTHLY, US_PRO_YEARLY } from "@/lib/pricing";

/**
 * The company pages (About, Security, Legal) as typed blocks, rendered by the
 * same block renderer as the docs. Every factual statement on the Security
 * page was written against the code it describes; the file and function are
 * named in the comment beside it so the page can be re-checked when the code
 * changes.
 */

const MAIL = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

/* ── About ─────────────────────────────────────────────────────────────── */

export const ABOUT_BLOCKS: Block[] = [
  p(
    "I built stocksbrew because following a company meant reopening the same tabs every morning. A price chart in one, the latest filing in another, a news search, an earnings calendar, someone's opinion on a forum. Most days nothing had changed, and I had spent twenty minutes finding that out.",
  ),
  p(
    "What I wanted was something that did the reading for me and reported back: this moved, here is why if there is a why, this reports on Thursday, nothing else needs you. So that is what this is.",
  ),
  h2("What I decided it would not do"),
  ul(
    "**It does not touch money.** There is no brokerage connection and no way to place a trade. I did not want to hold a credential that could move anyone's savings, and I think a research tool is more honest when it cannot profit from you trading more.",
    "**It does not make up a reason.** Most price moves have no clean cause. When we have not found one, the product says so in those words.",
    "**It does not let a model write the numbers.** Models write some of the sentences. Prices, returns, ratios, the call and the zones are computed or copied from a source.",
    "**It does not show a backtest as a track record.** Simulated results are labelled as simulated, with the period and the reasons they flatter.",
  ),
  h2("Who is behind it"),
  p(
    "stocksbrew is a small independent product, built and run by me, Tarun Tomar. I write the code, the data pipelines and these pages. I am not a licensed investment adviser, a portfolio manager or a broker, and nothing here is advice for your situation.",
  ),
  p("There is no team page because there is no team to put on one, and no investor logos because there are none."),
  h2("How it pays for itself"),
  p(
    `Reading is free: stock reports, our call on ${CALL_COVERAGE}, filings, fund pages and strategies. Pro is $${US_PRO_MONTHLY} a month or $${US_PRO_YEARLY} a year and pays for the parts that run on your behalf. There are no ads, no affiliate links in our comparisons and no selling of your data. See [Free vs Pro](/docs/start/free-vs-pro).`,
  ),
  h2("If something is wrong"),
  p(`If a page is confusing or a number looks wrong, email me at ${MAIL} with the page and what you expected. I read every message. How errors get corrected is in [Editorial standards and corrections](/docs/methodology/corrections).`),
];

/* ── Security ──────────────────────────────────────────────────────────── */

export const SECURITY_BLOCKS: Block[] = [
  p(
    "This page says exactly how accounts, data and money are handled, taken from the code. Where something is not built, it says so. It is a description of how the product works, not a certification: we have not had an outside security audit and we hold no compliance attestations.",
  ),

  h2("Your money"),
  ul(
    "**There is no brokerage or bank connection.** The product has no integration with any broker, bank or account aggregator. We never ask for brokerage credentials.",
    "**There is no trading.** No part of the app, the API or the agents can place, change or cancel an order.",
    "**Your holdings are numbers you typed.** They are stored as a ticker, a share count, a cost and optionally a market value. They are not linked to any real account.",
    "**The practice account is pretend money.** It is a ledger of paper trades and cannot become a real order.",
  ),

  h2("Signing in"),
  // lib/sign-in.ts (GoogleAuthProvider + signInWithPopup), app/api/auth/session/route.ts
  ul(
    "Sign-in is with Google only, through Firebase Authentication. There is no stocksbrew password, so there is none for us to store or leak.",
    "From Google we receive your name, your email address and your profile picture. We do not request access to your Gmail, Drive, contacts or calendar.",
    "After Google confirms who you are, our server checks the sign-in token, including whether it has been revoked, and sets a session cookie.",
    "The session cookie is HTTP-only, so page scripts cannot read it. It is marked Secure in production and SameSite=Lax, and it lasts five days. Signing out clears it.",
    "Two-step verification is whatever you have set on your Google account. We do not add a second factor of our own.",
  ),

  h2("What we store about you"),
  // users/{uid} in lib/watchlist.ts (UserDoc), plus the collections named below
  table(
    ["What", "Detail"],
    [
      ["Identity", "Name, email address, profile picture, the time you joined and the time you last signed in."],
      ["Portfolio", "The stocks you hold and watch. For a holding: shares, average cost, market value and whether it was entered by hand. Also the times you added new stocks in the last week, which is how the Free swap limit is counted."],
      ["Following", "Investors you follow, strategies you track and market assets you watch."],
      ["Alerts and agents", "Your alert rules, your agents and each agent's run log."],
      ["Briefing", "Which items you marked Got it or Keep watching, kept for seven days of briefings."],
      ["Ask", "Your conversations, so you can return to them: the most recent 40, each with its last 60 messages. Also a daily count of questions."],
      ["Daily limits", "A count per day of questions, backtests and API calls. For signed-out visitors the count is kept against a hash of the IP address. The address itself is not stored with it."],
      ["Practice account", "Paper cash, positions and trades."],
      ["Email settings", "Whether alert emails and market emails are on."],
      ["Plan", "See the section on payments below."],
      ["How you found us", "Your answer to the one sign-up question, if you gave one."],
      ["Developer access", "For each token: a name, when it was created and last used, a call count, and a SHA-256 hash of its secret. The secret itself is shown to you once and never stored."],
      ["Feedback", "Messages you send through the feedback form, with your email address so we can reply."],
      ["Account events", "A log of plan changes such as subscribed, renewed and cancelled, used to run billing emails and to understand churn."],
    ],
  ),
  p("We do not store: brokerage credentials, card numbers, bank details, government identifiers, your address or your phone number. We do not ask for any of them."),

  h2("Where it lives"),
  ul(
    "Account data is kept in a document database that we run on our own server. The app reaches it over HTTPS with a server-side credential that is never sent to your browser.",
    "An earlier copy of account data remains in Google Cloud Firestore, where the product used to keep it. We are keeping it for rollback while we finish moving off it.",
    "The app is hosted on Vercel. Sign-in is handled by Google Firebase Authentication.",
    "Individual fields are not encrypted inside the database. Protection is at the level of the server, the disk and the network connection.",
    "Your portfolio is private to your account. Pages and API routes that return it check your session first.",
  ),

  h2("Payments"),
  // app/api/subscription/create-checkout, webhook, cancel; lib/delete-user-account.ts
  ul(
    "Payment is handled by Dodo Payments, on their checkout page. Card details go to them and never reach our servers.",
    "From them we store: a customer id, a subscription id, the plan (monthly or yearly), the status, and the times of activation, last payment, payment failure and cancellation.",
    "Plan changes reach us as signed messages from the payment provider. We verify the signature before acting on one whenever the signing secret is configured, which production needs.",
    "Cancelling from Account tells the payment provider to stop at the next billing date. You keep Pro until then. We ask for a reason, which is stored with your account.",
    "We do not store the date of your next charge. It is on the receipt the payment provider emails you.",
    `There is no refund button in the app. For a billing problem, email ${MAIL}.`,
  ),

  h2("Who else receives data"),
  table(
    ["Service", "What it receives", "Why"],
    [
      ["Google Firebase Authentication", "Your Google sign-in", "To confirm who you are"],
      ["Dodo Payments", "Your email address and payment details you enter on their page", "To bill Pro"],
      ["Brevo", "Your email address and the content of emails we send you", "To deliver email"],
      ["OpenAI", "Questions you type into Ask and the data its lookups return, which includes your holdings when you ask about your portfolio", "To write the answer"],
      ["A web search service", "Search terms from Ask and from our research jobs", "To find recent sources"],
      ["PostHog", "Page views and feature use, tied to your account id, name and email once you sign in", "Product analytics"],
      ["Google Analytics", "Page views and traffic sources", "Traffic reporting"],
      ["Vercel", "Requests to the site, as any host sees them", "Hosting"],
    ],
  ),
  p("We do not sell or rent personal data, and we do not run advertising."),

  h2("Developer tokens and connected agents"),
  // lib/agent-auth.ts, lib/agent-auth-core.ts, lib/agent-oauth.ts
  ul(
    "A personal token is shown once when you create it. We keep a SHA-256 hash of its secret and compare hashes in constant time. We cannot show you the token again.",
    "You can have up to five active personal tokens and revoke any of them from Account. A revoked token fails on its next call.",
    "Agents that connect through OAuth get an access token that lasts one hour and a single-use refresh token that lasts 30 days. The flow requires PKCE.",
    "Every token is limited by scope, and every call is checked against an active Pro plan and the daily and per-minute limits.",
    "A token can read your portfolio and alerts, add or remove a stock, and create or deactivate a price alert. It cannot trade, pay, change your plan or delete your account.",
    "Revoking a connected OAuth agent from Account is not built yet. To cut one off today, email us, or let its tokens expire: access ends within the hour and renewal ends when the refresh token is used or expires.",
  ),

  h2("Exporting your data"),
  // app/profile/export/route.ts
  p(
    "Account has a **Download my data** button. It returns one JSON file with your profile, portfolio, email settings, followed investors, tracked strategies, watched markets, alerts, agents and their recent runs, your practice account and the names of your developer tokens. It lists your active alerts, up to 100, and your most recent agent runs. It does not include Ask conversations, briefing item state, feedback messages or analytics events yet. Email us if you need those.",
  ),

  h2("Deleting your account"),
  // lib/delete-user-account.ts
  p("Account has a **Delete account** button. It asks you to confirm, then does the following straight away."),
  ul(
    "Schedules any paid subscription to cancel at the end of its period.",
    "Deletes your account record: identity, portfolio, followed investors, tracked strategies, watched markets, email settings and plan fields.",
    "Deletes your portfolio views and history, your portfolio inbox, your fired-alert flags, your developer tokens, their usage counts and any pending agent sign-in codes.",
    "Deletes your Google sign-in from our Firebase project and clears the session cookie.",
  ),
  warn(
    "The delete button does not yet remove everything. Still left after it runs: your alert rules, your agents and their run logs, your practice account, your Ask conversations, briefing item state, daily limit counters, feedback messages, the account events log, and analytics history at PostHog and Google. The earlier copy of your account in Firestore is not touched by the button either. Email us and we will remove the rest by hand. Closing this gap is on our list.",
    "What deletion does not cover yet",
  ),

  h2("What is not built"),
  ul(
    "No outside security audit, penetration test or compliance attestation.",
    "No bug bounty. We still want to hear about problems: see below.",
    "No field-level encryption of account data.",
    "No second factor of our own beyond your Google account's.",
    "No list of active sessions, and no way to sign out other devices except waiting for the five-day session to end.",
    "No self-serve revoke for OAuth-connected agents.",
    "No automatic deletion of inactive accounts.",
  ),

  h2("Reporting a security problem"),
  p(`Email ${MAIL} with what you found and how to reproduce it. Please do not test against other people's accounts or data. We will reply, fix what is confirmed and tell you when it is fixed.`),
  note("Last reviewed against the code on November 10, 2026."),
];

/* ── Legal ─────────────────────────────────────────────────────────────── */

export type LegalDoc = {
  slug: "privacy" | "terms" | "disclaimer" | "cookies";
  title: string;
  tab: string;
  description: string;
  lede: string;
  updated: string;
  blocks: Block[];
};

const LEGAL_UPDATED = "2026-11-09";

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "privacy",
    title: "Privacy policy",
    tab: "Privacy",
    description: "What stocksbrew collects, why, who else receives it, and how to export or delete it.",
    lede: "What we collect, why, who else receives it and what you can do about it.",
    updated: LEGAL_UPDATED,
    blocks: [
      h2("What we collect"),
      ul(
        "**Account information.** Your name, email address and profile picture, from Google when you sign in. Sign-in is handled by Firebase Authentication.",
        "**What you put in.** The stocks you hold and watch, sizes and costs you enter, alerts, agents, followed investors, tracked strategies, practice trades, saved state in the briefing, questions you ask and feedback you send.",
        "**Plan and billing status.** Identifiers and status from our payment provider. Not your card.",
        "**Usage.** Page views, navigation and feature use, tied to your account once you sign in.",
        "**Developer access.** Token names, scopes, client names, call counts and last-used times. Token secrets are stored only as one-way hashes.",
      ),
      p("The full list, with where each item lives, is on [Security](/security)."),
      h2("Why we collect it"),
      p("To run the service: to identify you, to build your briefing from your stocks, to send the emails you have on, to bill Pro, and to find what is working and what is broken. We do not sell or rent personal data and we do not run advertising."),
      h2("Cookies"),
      p("We set a small number of cookies to keep you signed in and remember your market. See the [cookie policy](/legal/cookies)."),
      h2("Third parties"),
      ul(
        "Google Firebase Authentication, for sign-in.",
        "Dodo Payments, for billing.",
        "Brevo, for sending email.",
        "OpenAI, to write model-generated text, including answers in Ask. A question about your portfolio sends your holdings with it.",
        "A web search service, for finding sources.",
        "PostHog and Google Analytics, for analytics.",
        "Vercel, for hosting.",
        "Market data and news vendors, which supply data to us and do not receive yours.",
      ),
      p("Account data is stored in a database on a server we run. An earlier copy remains in Google Cloud Firestore while we finish moving off it."),
      h2("Your controls"),
      ul(
        "Change your portfolio, alerts, agents and email settings in the app at any time.",
        "Revoke developer tokens in [Account](/profile#agent-access).",
        "Download your data from [Account](/profile#data).",
        "Delete your account from [Account](/profile#data). What that removes, and what it does not yet remove, is listed on [Security](/security).",
        `For anything else, including a full erasure or a copy of data the download does not cover, email ${MAIL}.`,
      ),
      h2("Children"),
      p("stocksbrew is not directed at anyone under 18 and we do not knowingly collect data from them. If you believe a minor has signed up, contact us and we will remove the account."),
      h2("Changes"),
      p("If we make a material change to this policy we will say so in the app and update the date above."),
    ],
  },
  {
    slug: "terms",
    title: "Terms of service",
    tab: "Terms",
    description: "The rules for using stocksbrew: accounts, acceptable use, developer access, subscriptions and liability.",
    lede: "The rules for using stocksbrew.",
    updated: LEGAL_UPDATED,
    blocks: [
      h2("Who we are"),
      p("stocksbrew is a research and tracking service for US-listed stocks. It publishes market data, news, filings data, computed analysis and model-written commentary. We, us and stocksbrew refer to the operator of the service. You refers to the person using it."),
      h2("Account and eligibility"),
      p("You must be at least 18 to create an account. You are responsible for keeping your Google account secure and for activity under your stocksbrew account. We may suspend or close accounts that abuse the service, scrape data or break the law."),
      h2("Not investment advice"),
      p("Everything stocksbrew publishes, including briefings, calls, price zones, alerts, screens, strategies, backtests, agent reports and answers in Ask, is for information and education only. stocksbrew is not a registered investment adviser or a broker. Nothing on the service is a recommendation to buy, sell or hold any security. Do your own research and consider speaking to a licensed adviser before making investment decisions."),
      h2("No brokerage, no trading"),
      p("stocksbrew does not connect to brokerage or bank accounts and does not place trades. The practice account uses pretend money. Any decision to trade, and its outcome, is yours."),
      h2("Data and accuracy"),
      p("We take prices, fundamentals, filings and news from third parties and compute and write on top of them. Data can be delayed, incomplete or wrong, and prices are not real time. Backtested and simulated results describe the past under stated assumptions and do not predict future results. We do not warrant the accuracy or timeliness of anything on the service. You use it at your own risk."),
      h2("Acceptable use"),
      ul(
        "Do not scrape, mirror or resell stocksbrew data.",
        "Do not reverse-engineer the service or try to get around rate limits or plan limits.",
        "Do not use stocksbrew to harass, deceive or manipulate markets.",
      ),
      h2("Agent and developer access"),
      p("An active Pro subscription may include scoped access through our MCP server, API and CLI. That access is for your own agents, scripts and internal workflows. It does not include the right to bulk-download, mirror, redistribute, sublicense or resell stocksbrew data or results derived from it, or to serve another product's users with it. We may enforce call limits, revoke exposed credentials and suspend access that gets around safeguards or creates unreasonable load. Keep tokens secret and revoke them if they are exposed. You are responsible for activity performed with tokens issued to your account."),
      h2("Subscriptions"),
      p("Some features need a paid subscription. Prices, billing periods and what each plan includes are on the [pricing page](/pricing). You can cancel from Account. Cancelling stops the next charge and access continues until the end of the period already paid for. Developer access ends when Pro ends."),
      h2("Termination"),
      p("You can stop using stocksbrew at any time and delete your account from Account. We can suspend or end the service, or your access to it, with reasonable notice, or immediately if you break these terms."),
      h2("Liability"),
      p("To the maximum extent permitted by law, stocksbrew is not liable for investment losses, lost profits or indirect damages arising from your use of the service. The service is provided as is."),
      h2("Contact"),
      p(`Questions about these terms: ${MAIL}.`),
    ],
  },
  {
    slug: "disclaimer",
    title: "Disclaimer",
    tab: "Disclaimer",
    description: "stocksbrew is not investment advice. What that means for calls, backtests, model-written text and agents.",
    lede: "What stocksbrew is not, stated once and plainly.",
    updated: LEGAL_UPDATED,
    blocks: [
      h2("Not investment advice"),
      p("stocksbrew publishes market data, news, filings data, calls, screens, strategies, backtests and alerts. None of it is investment advice. stocksbrew is not a registered investment adviser, broker-dealer or financial planner in any jurisdiction. Nothing on the service is a recommendation to buy, sell or hold any security."),
      h2("Calls and price zones"),
      p("The call on a stock and its price zones are produced by fixed rules from public data. They are not personalised, they do not know your circumstances, and they can be wrong. See [How calls and zones are produced](/docs/methodology/calls-and-zones)."),
      h2("Past and simulated performance"),
      p("Historical returns do not guarantee future performance. Backtests, Follow records and replays are simulations: nobody held those portfolios, and the results are subject to the biases described beside them, including survivorship and hindsight. Practice account results are not real results."),
      h2("Model-written content"),
      p("Some text on the service is written by language models from news, filings and price data. It can be incomplete, out of date or wrong. Check it against the linked sources before relying on it. See [What is written by a model](/docs/methodology/model-written-vs-computed)."),
      h2("Disclosures by others"),
      p("Fund filings, congressional disclosures and insider filings are reported as filed, often weeks or months after the trades they describe. Reporting a trade is not a suggestion to copy it and implies nothing about the person who made it."),
      h2("Use through agents and APIs"),
      p("An external agent may combine stocksbrew output with its own prompts, memory, tools or other data. We do not control or endorse the result. Check timestamps and primary sources, and do not let an agent make or carry out financial decisions without your own review."),
      h2("Do your own research"),
      p("Investing involves risk, including the loss of what you invest. Before any decision, consider your own circumstances, do your own research and consult a licensed adviser if you need one."),
    ],
  },
  {
    slug: "cookies",
    title: "Cookie policy",
    tab: "Cookies",
    description: "The cookies and browser storage stocksbrew uses, what each is for, and how to clear them.",
    lede: "The cookies and browser storage we use and what each is for.",
    updated: LEGAL_UPDATED,
    blocks: [
      h2("Cookies we set"),
      table(
        ["Name", "What it does", "Lasts"],
        [
          ["`tikrr_session`", "Keeps you signed in. HTTP-only, so page scripts cannot read it.", "5 days, or until you sign out"],
          ["`tikrr_market`", "Remembers which market you are browsing.", "Until cleared"],
        ],
      ),
      h2("Browser storage"),
      p("We also keep a few preferences in your browser's local storage: light or dark theme, whether you have seen an onboarding step, and the open or closed state of side panels. These stay on your device and are not sent to us as cookies."),
      h2("Analytics"),
      p("We use PostHog and Google Analytics to understand traffic and how the product is used. They may set their own cookies or browser identifiers. We do not use them for advertising and we do not run ads."),
      h2("Sign-in and payment"),
      p("Google sets its own cookies when you sign in with your Google account. Our payment provider sets its own on its checkout page."),
      h2("Managing cookies"),
      p("You can clear cookies and site data in your browser at any time. Clearing the session cookie signs you out. Blocking analytics cookies does not affect how the product works."),
    ],
  },
];

export function getLegalDoc(slug: string): LegalDoc | null {
  return LEGAL_DOCS.find((doc) => doc.slug === slug) ?? null;
}

// Re-exported so pages do not need a second import for sub-headings.
export { h3 };
