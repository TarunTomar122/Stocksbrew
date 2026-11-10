#!/usr/bin/env node
// Creates or updates the PostHog dashboard "stocksbrew: growth" (docs/analytics.md).
// Idempotent: the dashboard is found by name, each tile by insight name; existing
// tiles get their query and description replaced, missing ones are added. Tiles
// this script does not know are left alone. Every saved insight is fetched back
// and computed once to confirm it loads.
//
//   node scripts/analytics/create-dashboard.mjs            create or update, then verify
//   node scripts/analytics/create-dashboard.mjs --dry-run  print what it would send
//   node scripts/analytics/create-dashboard.mjs --verify   only fetch and compute the tiles
//
// Needs a PostHog personal API key (POSTHOG_TOKEN or POSTHOG_PERSONAL_API_KEY) with
// the scopes dashboard:write, insight:write and query:read, plus POSTHOG_PROJECT_ID.

import { HOSTS, SITE_SQL, api, config, listAll, requireConfig } from "./posthog-api.mjs";

const DASHBOARD = "stocksbrew: growth";
const DRY = process.argv.includes("--dry-run");
const VERIFY_ONLY = process.argv.includes("--verify");

/* ── shared filters ─────────────────────────────────────────────────────── */

// The project is shared with other sites: every tile is limited to stocksbrew,
// and anything tagged $environment=dev (local debugging) is excluded.
const SITE = [
  { key: "$host", type: "event", operator: "exact", value: HOSTS },
  { key: "$environment", type: "event", operator: "is_not", value: ["dev"] },
];
const LAST_30 = { date_from: "-30d" };

const ev = (event, extra = {}) => ({ kind: "EventsNode", event, name: event, math: "total", ...extra });
const prop = (key, operator, value, type = "event") => ({ key, type, operator, value });

function trends(series, { breakdown, breakdownType = "event", display = "ActionsLineGraph", interval = "day", dateRange = LAST_30 } = {}) {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "TrendsQuery",
      series,
      interval,
      dateRange,
      properties: SITE,
      filterTestAccounts: true,
      trendsFilter: { display },
      ...(breakdown ? { breakdownFilter: { breakdown, breakdown_type: breakdownType, breakdown_limit: 15 } } : {}),
    },
  };
}

function funnel(series, { windowDays = 14, dateRange = LAST_30 } = {}) {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "FunnelsQuery",
      series,
      dateRange,
      properties: SITE,
      filterTestAccounts: true,
      funnelsFilter: {
        funnelVizType: "steps",
        funnelOrderType: "ordered",
        funnelWindowInterval: windowDays,
        funnelWindowIntervalUnit: "day",
      },
    },
  };
}

function table(query) {
  return { kind: "DataTableNode", source: { kind: "HogQLQuery", query: query.trim().replace(/\s+/g, " ") } };
}

const SINCE_30 = "timestamp > now() - interval 30 day";

/* ── the tiles ───────────────────────────────────────────────────────────── */
// `fills` says whether the tile has data from events already flowing before
// this release ("now") or only after the new tracking ships ("after deploy").

const TILES = [
  // Acquisition
  {
    name: "Daily visitors and signups",
    fills: "now",
    description: "Unique visitors (pageviews) and new accounts per day.",
    query: trends([ev("$pageview", { math: "dau", custom_name: "Visitors" }), ev("user_signed_up", { math: "dau", custom_name: "Signups" })]),
  },
  {
    name: "Visitors by channel",
    fills: "now",
    description: "Where visits come from (PostHog's channel type: search, social, referral, direct, paid).",
    query: trends([ev("$pageview", { math: "dau" })], { breakdown: "$channel_type", breakdownType: "session", display: "ActionsBarValue" }),
  },
  {
    name: "Visitors by referring domain",
    fills: "now",
    description: "The site that sent the visit (first page of the session).",
    query: trends([ev("$pageview", { math: "dau" })], { breakdown: "$entry_referring_domain", breakdownType: "session", display: "ActionsBarValue" }),
  },
  {
    name: "Visitors by UTM source",
    fills: "now",
    description: "Campaign links (utm_source on the landing URL).",
    query: trends([ev("$pageview", { math: "dau" })], { breakdown: "$entry_utm_source", breakdownType: "session", display: "ActionsBarValue" }),
  },
  {
    name: "Landing pages",
    fills: "now",
    description: "First page of each session: which pages bring people in.",
    query: trends([ev("$pageview", { math: "dau" })], { breakdown: "$entry_pathname", breakdownType: "session", display: "ActionsBarValue" }),
  },
  {
    name: "Device mix",
    fills: "now",
    description: "Visitors by device type.",
    query: trends([ev("$pageview", { math: "dau" })], { breakdown: "$device_type", display: "ActionsPie" }),
  },
  {
    name: "New vs returning visitors",
    fills: "after deploy",
    description: "user_returned fires on the first visit of a later day (per browser). Fixed in this release: before it, every anonymous page load got a new id.",
    query: trends([ev("$pageview", { math: "dau", custom_name: "All visitors" }), ev("user_returned", { math: "dau", custom_name: "Returning visitors" })]),
  },

  // Activation
  {
    name: "Activation funnel (14 days)",
    fills: "after deploy",
    description: "Visit, start sign-in, sign up, first stock, 3+ stocks, open the briefing, come back within 7 days. Conversion % per step.",
    query: funnel([
      ev("$pageview", { custom_name: "Visited" }),
      ev("signin_started", { custom_name: "Started sign-in" }),
      ev("user_signed_up", { custom_name: "Signed up" }),
      ev("stock_tracked", { custom_name: "First stock tracked" }),
      ev("stock_tracked", { custom_name: "3+ stocks tracked", properties: [prop("tracked_count", "gte", 3)] }),
      ev("$pageview", { custom_name: "Opened the briefing", properties: [prop("$pathname", "exact", ["/briefing"])] }),
      ev("user_returned", { custom_name: "Came back within 7 days", properties: [prop("days_since_first", "lte", 7)] }),
    ]),
  },
  {
    name: "Agents switched on and previewed",
    fills: "after deploy",
    description: "People previewing an agent and switching one on (the other activation moment).",
    query: trends([ev("agent_previewed", { math: "dau" }), ev("agent_switched_on", { math: "dau" }), ev("agent_paused", { math: "dau" })]),
  },

  // Conversion
  {
    name: "Conversion funnel: pricing to paid",
    fills: "after deploy",
    description: "Pricing page, checkout click, checkout created (server), subscription activated (Dodo webhook).",
    query: funnel([
      ev("$pageview", { custom_name: "Viewed pricing", properties: [prop("$pathname", "exact", ["/pricing"])] }),
      ev("checkout_clicked"),
      ev("checkout_started"),
      ev("subscription_activated"),
    ]),
  },
  {
    name: "Conversion funnel: any lock to paid",
    fills: "now (first two steps), after deploy (rest)",
    description: "Any lock shown, its button clicked, checkout clicked, checkout created, subscription activated.",
    query: funnel([ev("paywall_shown"), ev("paywall_unlock_clicked"), ev("checkout_clicked"), ev("checkout_started"), ev("subscription_activated")]),
  },
  {
    name: "Paywall and limit hits by feature",
    fills: "now (paywall_shown), after deploy (limit_hit)",
    description: "Which locks people meet (lib/entitlements.ts feature id). limit_hit is a meter or count running out.",
    query: trends([ev("paywall_shown"), ev("limit_hit")], { breakdown: "feature", display: "ActionsBarValue" }),
  },
  {
    name: "Upgrade clicks by gate",
    fills: "now",
    description: "Clicks on a lock's button, by the feature behind it.",
    query: trends([ev("paywall_unlock_clicked", { math: "dau" })], { breakdown: "feature", display: "ActionsBarValue" }),
  },
  {
    name: "Checkout clicks by surface",
    fills: "after deploy",
    description: "Where checkout was started from: pricing, a lock (with its feature), the stock page.",
    query: trends([ev("checkout_clicked", { math: "dau" })], { breakdown: "surface", display: "ActionsBarValue" }),
  },
  {
    name: "Paid conversions by gate",
    fills: "after deploy",
    description: "subscription_activated, by the surface and feature of the checkout click that led to it.",
    query: table(`
      SELECT coalesce(toString(properties.checkout_surface), '(unknown)') AS surface,
             coalesce(toString(properties.checkout_feature), '-') AS feature,
             toString(properties.period) AS period, toString(properties.market) AS market,
             count() AS activations
      FROM events
      WHERE event = 'subscription_activated' AND ${SINCE_30} AND ${SITE_SQL}
      GROUP BY surface, feature, period, market
      ORDER BY activations DESC
      LIMIT 50`),
  },

  // Engagement
  {
    name: "Top pages",
    fills: "now",
    description: "Pageviews and unique visitors by app area (first path segment).",
    query: table(`
      SELECT coalesce(nullIf(toString(properties.area), ''), nullIf(splitByChar('/', coalesce(toString(properties.$pathname), '/'))[2], ''), 'landing') AS area,
             count() AS views, count(DISTINCT person_id) AS visitors
      FROM events
      WHERE event = '$pageview' AND ${SINCE_30} AND ${SITE_SQL}
      GROUP BY area
      ORDER BY views DESC
      LIMIT 40`),
  },
  {
    name: "Top actions",
    fills: "now (legacy events), after deploy (new events)",
    description: "Every named product event, by volume and people. What people actually do.",
    query: table(`
      SELECT event, count() AS events, count(DISTINCT person_id) AS people
      FROM events
      WHERE ${SINCE_30} AND ${SITE_SQL} AND NOT startsWith(event, '$')
      GROUP BY event
      ORDER BY people DESC, events DESC
      LIMIT 60`),
  },
  {
    name: "Stock page: views, reads, follows, alerts",
    fills: "now (stock_viewed), after deploy (rest)",
    description: "From a stock page view to reading the brief, following the stock and setting an alert.",
    query: trends([
      ev("stock_viewed", { math: "dau" }),
      ev("read_viewed", { math: "dau" }),
      ev("stock_track_clicked", { math: "dau" }),
      ev("stock_tracked", { math: "dau" }),
      ev("alert_created", { math: "dau" }),
    ]),
  },
  {
    name: "Insight-row clicks by page",
    fills: "after deploy",
    description: "Clicks on The read rows (components/oa/insight.tsx), by page, kind of insight and link (stock or action).",
    query: table(`
      SELECT toString(properties.page) AS page, toString(properties.insight_kind) AS insight, toString(properties.target) AS link,
             count() AS clicks, count(DISTINCT person_id) AS people
      FROM events
      WHERE event = 'insight_clicked' AND ${SINCE_30} AND ${SITE_SQL}
      GROUP BY page, insight, link
      ORDER BY clicks DESC
      LIMIT 60`),
  },
  {
    name: "Research actions",
    fills: "after deploy",
    description: "Briefing items opened, movers opened, screener filters, saved screens, exports, funds opened, follows, backtests, compares.",
    query: trends(
      [
        ev("briefing_item_opened", { math: "dau" }),
        ev("mover_opened", { math: "dau" }),
        ev("screener_filter_applied", { math: "dau" }),
        ev("screen_saved", { math: "dau" }),
        ev("screener_exported", { math: "dau" }),
        ev("fund_opened", { math: "dau" }),
        ev("follow_clicked", { math: "dau" }),
        ev("backtest_run", { math: "dau" }),
        ev("compare_run", { math: "dau" }),
      ],
      { display: "ActionsBarValue" },
    ),
  },
  {
    name: "Searches with no result",
    fills: "after deploy",
    description: "What people searched for and did not find: stocks to add.",
    query: table(`
      SELECT toString(properties.query) AS query, count() AS searches, count(DISTINCT person_id) AS people
      FROM events
      WHERE event = 'search_performed' AND toString(properties.found) = 'false' AND ${SINCE_30} AND ${SITE_SQL}
      GROUP BY query
      ORDER BY searches DESC
      LIMIT 40`),
  },
  {
    name: "Ask usage and failures",
    fills: "after deploy",
    description: "Questions asked, answers received, failures (limit, error, aborted).",
    query: trends([ev("ask_question_asked"), ev("ask_answer_received"), ev("ask_answer_failed")]),
  },
  {
    name: "Ask failures by reason",
    fills: "after deploy",
    description: "Why answers failed: the daily limit, a server error, or the person stopped it.",
    query: trends([ev("ask_answer_failed")], { breakdown: "reason", display: "ActionsBarValue" }),
  },

  // Retention
  {
    name: "Weekly active users",
    fills: "now",
    description: "Unique visitors over the trailing 7 days.",
    query: trends([ev("$pageview", { math: "weekly_active" })], { dateRange: { date_from: "-90d" } }),
  },
  {
    name: "Weekly retention",
    fills: "now (signed-in people), after deploy (all visitors)",
    description: "Of people first seen in a week, how many came back in later weeks.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "RetentionQuery",
        dateRange: { date_from: "-56d" },
        properties: SITE,
        filterTestAccounts: true,
        retentionFilter: {
          retentionType: "retention_first_time",
          totalIntervals: 8,
          period: "Week",
          targetEntity: { id: "$pageview", name: "$pageview", type: "events" },
          returningEntity: { id: "$pageview", name: "$pageview", type: "events" },
        },
      },
    },
  },
  {
    name: "Stickiness",
    fills: "now",
    description: "How many days in the last 30 each visitor came back.",
    query: {
      kind: "InsightVizNode",
      source: { kind: "StickinessQuery", series: [ev("$pageview")], interval: "day", dateRange: LAST_30, properties: SITE, filterTestAccounts: true },
    },
  },
  {
    name: "Returned within 1 and 7 days",
    fills: "after deploy",
    description: "user_returned by days since the first visit: D1 and D7 returners.",
    query: table(`
      SELECT multiIf(toInt(properties.days_since_first) <= 1, 'D1', toInt(properties.days_since_first) <= 7, 'D2-D7', 'D8+') AS bucket,
             count(DISTINCT person_id) AS people
      FROM events
      WHERE event = 'user_returned' AND ${SINCE_30} AND ${SITE_SQL}
      GROUP BY bucket
      ORDER BY bucket`),
  },

  // Quality
  {
    name: "Client errors",
    fills: "after deploy",
    description: "Uncaught errors and unhandled rejections in the browser ($exception), by page.",
    query: trends([ev("$exception")], { breakdown: "$pathname", display: "ActionsLineGraph" }),
  },
  {
    name: "Checkout and sign-in failures",
    fills: "after deploy",
    description: "Checkout requests that failed and sign-ins that did not finish (popup closed, network).",
    query: trends([ev("checkout_failed"), ev("signin_failed")], { breakdown: "reason", display: "ActionsBarValue" }),
  },
];

/* ── run ─────────────────────────────────────────────────────────────────── */

async function findDashboard() {
  const all = await listAll("/api/projects/{project}/dashboards/?limit=200");
  return all.find((dashboard) => dashboard.name === DASHBOARD && !dashboard.deleted) ?? null;
}

async function verify(dashboardId) {
  const dashboard = await api("GET", `/api/projects/{project}/dashboards/${dashboardId}/`);
  const tiles = (dashboard.tiles ?? []).filter((tile) => tile.insight);
  const rows = [];
  for (const tile of tiles) {
    const plan = TILES.find((entry) => entry.name === tile.insight.name);
    try {
      const insight = await api("GET", `/api/projects/{project}/insights/${tile.insight.id}/?refresh=blocking`);
      const result = insight.result ?? insight.results ?? null;
      const empty = result == null || (Array.isArray(result) && result.length === 0);
      rows.push({ tile: tile.insight.name, loads: "yes", has_data: empty ? "no" : "yes", fills: plan?.fills ?? "-" });
    } catch (error) {
      rows.push({ tile: tile.insight.name, loads: `NO: ${String(error.message).slice(0, 80)}`, has_data: "-", fills: plan?.fills ?? "-" });
    }
  }
  console.table(rows);
  const broken = rows.filter((row) => row.loads !== "yes").length;
  console.log(`${rows.length} tiles, ${broken} failed to load.`);
  return broken;
}

if (DRY) {
  for (const tile of TILES) console.log(JSON.stringify({ name: tile.name, query: tile.query }, null, 1));
  console.log(`\n${TILES.length} tiles for "${DASHBOARD}".`);
  process.exit(0);
}

requireConfig();

let dashboard = await findDashboard();
if (VERIFY_ONLY) {
  if (!dashboard) {
    console.error(`No dashboard named "${DASHBOARD}" yet.`);
    process.exit(1);
  }
  process.exit((await verify(dashboard.id)) ? 1 : 0);
}

const description =
  "Visitors, activation, conversion, what people do and what breaks. Built by scripts/analytics/create-dashboard.mjs; the tracking plan is docs/analytics.md. stocksbrew hosts only, dev events excluded.";
if (!dashboard) {
  dashboard = await api("POST", "/api/projects/{project}/dashboards/", { name: DASHBOARD, description, pinned: true });
  console.log(`Created dashboard ${dashboard.id}.`);
} else {
  await api("PATCH", `/api/projects/{project}/dashboards/${dashboard.id}/`, { description });
  console.log(`Updating dashboard ${dashboard.id}.`);
}

const detail = await api("GET", `/api/projects/{project}/dashboards/${dashboard.id}/`);
const existing = new Map((detail.tiles ?? []).filter((tile) => tile.insight).map((tile) => [tile.insight.name, tile.insight]));

for (const tile of TILES) {
  const body = { name: tile.name, description: `${tile.description} Fills: ${tile.fills}.`, query: tile.query };
  try {
    const found = existing.get(tile.name);
    if (found) {
      await api("PATCH", `/api/projects/{project}/insights/${found.id}/`, body);
      console.log(`  updated  ${tile.name}`);
    } else {
      await api("POST", "/api/projects/{project}/insights/", { ...body, dashboards: [dashboard.id] });
      console.log(`  created  ${tile.name}`);
    }
  } catch (error) {
    console.error(`  FAILED   ${tile.name}: ${error.message}`);
    if (error.status === 403) {
      console.error("The API key lacks a write scope. Grant dashboard:write and insight:write (plus query:read) to the personal API key.");
      process.exit(3);
    }
  }
}

const broken = await verify(dashboard.id);
console.log(`\nDashboard: ${config.host}/project/${config.projectId}/dashboard/${dashboard.id}`);
process.exit(broken ? 1 : 0);
