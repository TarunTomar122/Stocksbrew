#!/usr/bin/env node
// What PostHog actually received from stocksbrew in the last N days (default 30):
// every event's volume and unique people, pageviews by app area, identify and
// person health, and which planned events (docs/analytics.md) have not arrived yet.
//
//   node scripts/analytics/audit-events.mjs [days]
//
// Needs a personal API key with query:read (see posthog-api.mjs).

import { SITE_SQL, hogql, requireConfig } from "./posthog-api.mjs";

const PLANNED = [
  "$pageview", "$pageleave", "$autocapture", "$exception", "$web_vitals", "$identify",
  "signin_started", "signin_failed", "user_signed_up", "user_signed_in", "user_returned",
  "stock_viewed", "read_viewed", "read_expanded", "stock_track_clicked", "stock_tracked", "stock_untracked", "alert_created",
  "portfolio_viewed", "briefing_item_opened", "mover_opened", "signal_opened", "insight_clicked",
  "screener_filter_applied", "screen_saved", "screener_exported", "fund_opened", "follow_clicked",
  "agent_previewed", "agent_switched_on", "agent_paused", "agent_report_opened",
  "ask_question_asked", "ask_answer_received", "ask_answer_failed", "backtest_run", "compare_run", "search_performed",
  "paywall_shown", "paywall_unlock_clicked", "limit_hit", "checkout_clicked", "checkout_failed", "checkout_started",
  "checkout_returned", "subscription_activated", "subscription_renewed", "subscription_payment_succeeded",
];

const days = Math.max(1, Math.min(90, Number(process.argv[2]) || 30));
requireConfig();

const since = `timestamp > now() - interval ${days} day`;

const [events, areas, people, envs] = await Promise.all([
  hogql(`
    SELECT event, count() AS events, count(DISTINCT person_id) AS people, max(timestamp) AS last_seen
    FROM events
    WHERE ${since} AND ${SITE_SQL}
    GROUP BY event
    ORDER BY events DESC
    LIMIT 300
  `),
  hogql(`
    SELECT coalesce(nullIf(toString(properties.area), ''), splitByChar('/', coalesce(toString(properties.$pathname), '/'))[2], 'landing') AS area,
           count() AS views, count(DISTINCT person_id) AS people
    FROM events
    WHERE ${since} AND ${SITE_SQL} AND event = '$pageview'
    GROUP BY area
    ORDER BY views DESC
    LIMIT 60
  `),
  hogql(`
    SELECT
      count(DISTINCT person_id) AS people,
      count(DISTINCT if(event = '$identify', person_id, NULL)) AS identified_people,
      countIf(event = '$identify') AS identify_events,
      count(DISTINCT if(event = '$pageview', properties.$session_id, NULL)) AS sessions,
      count(DISTINCT if(event = '$pageview', distinct_id, NULL)) AS pageview_distinct_ids,
      count(DISTINCT if(event = '$pageview', person_id, NULL)) AS pageview_people
    FROM events
    WHERE ${since} AND ${SITE_SQL}
  `),
  hogql(`
    SELECT coalesce(toString(properties.$environment), '(none)') AS environment, properties.$host AS host, count() AS events
    FROM events
    WHERE ${since} AND (properties.$host LIKE '%stocksbrew%' OR properties.$host LIKE '%localhost%' OR properties.$host LIKE '%vercel.app%')
    GROUP BY environment, host
    ORDER BY events DESC
    LIMIT 20
  `),
]);

console.log(`\nstocksbrew events, last ${days} days\n`);
console.table(events.map((row) => ({ event: row.event, events: row.events, people: row.people, last_seen: String(row.last_seen).slice(0, 16) })));
console.log("\nPageviews by area");
console.table(areas);
console.log("\nPeople and identify");
console.table(people);
console.log("\nHosts and environments (dev and preview should be absent or tagged dev)");
console.table(envs);

const seen = new Set(events.map((row) => row.event));
const missing = PLANNED.filter((name) => !seen.has(name));
const unplanned = events.map((row) => row.event).filter((name) => !PLANNED.includes(name));
console.log(`\nPlanned events not received in ${days} days (new ones fill after deploy):\n  ${missing.join(", ") || "none"}`);
console.log(`\nReceived but not in the plan (legacy or autocapture):\n  ${unplanned.join(", ") || "none"}\n`);
