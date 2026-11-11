# Analytics: the tracking plan

What we track in PostHog, why, and where each event is fired. Every event
answers a question we act on; if an event stops answering one, delete it.
The dashboard is **stocksbrew: growth** (built by
`scripts/analytics/create-dashboard.mjs`).

## Ground rules

- **Names are `object_action`**, lowercase: `stock_tracked`, `checkout_clicked`.
  PostHog's own events keep their `$` names (`$pageview`, `$exception`).
- **No PII.** The only identifier is the Firebase uid (via `identify`). No email,
  no name, no free text a person typed into Ask, no portfolio values, prices
  paid or share counts. Tickers, feature ids, surfaces and counts are fine.
  Search queries are sent uppercased and capped at 40 characters (they are
  stock lookups, and the no-result ones tell us what to add).
- **Never blocks, never throws.** Browser helpers are fire-and-forget
  (`lib/posthog.ts`); server events use `captureServerEventSafe` or
  `.catch(() => undefined)` with a 3 second timeout.
- **Only production sends.** `lib/analytics-env.ts` decides:
  - Browser: only `www.stocksbrew.online` / `stocksbrew.online` on a production
    build that is not a Vercel preview. Localhost, `next dev`, previews and
    other hosts send nothing.
  - Server: only `VERCEL_ENV=production` (or `NODE_ENV=production` with
    `POSTHOG_SERVER_CAPTURE=1` off Vercel). `POSTHOG_SERVER_CAPTURE=0` turns it off.
  - The PostHog project is **shared with other sites**, so every query and
    dashboard tile filters `$host` to the two stocksbrew hosts and excludes
    `$environment = dev`.
- **Super properties** (on every browser event): `plan` (`anon` / `free` /
  `pro`), `signed_in`, `$environment` (`production` or `dev`), `app_version`
  (short commit sha from `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`). PostHog adds
  `$pathname`, `$current_url`, `$referring_domain`, `$device_type`, UTM
  properties and session properties (`$entry_pathname`, `$channel_type`) itself.
  Most events also carry `page`, the app area (`stock`, `screener`, `landing`).
- **Declared clicks.** Server components declare tracking in markup and one
  listener sends it (`lib/analytics-dom.ts`): `data-track="event"` on an
  element, or `data-track-links="event"` on a container (any link inside sends
  it, with `ticker` from `/stock/X` hrefs and the link's path). `data-track-*`
  attributes become snake_case properties. A `<summary>` counts only when it opens.

## Testing locally

Nothing is sent from localhost. To see what would be sent, open the app on
the dev server, run `localStorage.setItem("sb_analytics_debug", "1")` in the
console and reload: every capture, identify and super property prints as an
`[analytics] ...` console line (with `$environment: "dev"`), and nothing
leaves the browser. Remove the key to stop.

## Identity

| What | Where | Notes |
|---|---|---|
| `identify(uid)` | `lib/sign-in.ts` (right after sign-in, before `user_signed_up`) and `lib/auth-context.tsx` (every load with a Firebase user) | uid only; `signed_up_at` (a date) on new accounts. Skipped when already identified as that uid. |
| reset | `lib/auth-context.tsx` when Firebase reports no user **and** PostHog holds an identified person | Fixed in this release: it used to reset on every anonymous page load, minting a new visitor id each visit. |
| `plan` / `signed_in` | `components/posthog-pageview.tsx` (from `/api/user/profile`, cached per session), `anon` on sign-out, `pro` on checkout return | |

## Events

### Acquisition and retention

| Event | Properties | Fired from | Answers |
|---|---|---|---|
| `$pageview` | `path`, `area`, `referrer` (first view only), `utm_*`, `source` (`?ref=`), `ai_referrer`, `discovery_channel` | `components/posthog-pageview.tsx`, first load and every app-router navigation to a new path (query-only changes such as a screener filter are not new pageviews) | Visitors, sources, landing pages, devices, top pages, retention |
| `user_returned` | `days_since_first`, `days_since_last` | same component, first visit of a later UTC day (per browser, `localStorage.sb_visits`) | New vs returning, D1/D7 return |
| `$pageleave`, `$autocapture`, `$web_vitals`, `$exception` | PostHog's own | posthog-js (`capture_pageleave`, `autocapture`, project web-vitals setting, `capture_exceptions: true`) | Time on page, unplanned clicks, slow pages, client errors |

### Activation

| Event | Properties | Fired from | Answers |
|---|---|---|---|
| `signin_started` | `surface`, `page` | `lib/sign-in.ts` | Which buttons start sign-in |
| `signin_failed` | `surface`, `reason` (Firebase code, e.g. `auth/popup-closed-by-user`) | `lib/sign-in.ts` | Where sign-in breaks or is abandoned |
| `user_signed_up` / `user_signed_in` | `surface`, `method`, `page` | `lib/sign-in.ts` | Signups by entry point (`import_try` is "Save this portfolio" on `/import`) |
| `stock_track_clicked` | `ticker`, `signed_in`, `surface` | `components/track-button.tsx` | Intent to follow, including signed-out |
| `stock_tracked` | `ticker`, `tracked_count`, `first`, `covered`, `position_type`, `via` (`single`/`batch`/`import`), `added_count`, `updated_count` (import) | **server**: `app/api/track/route.ts`, `app/api/watchlist/batch/route.ts`, `app/api/import/save/route.ts` | First stock, 3+ stocks (funnel steps) |
| `stock_untracked` | `ticker`, `via` | **server**, same routes | Churn from the portfolio |
| `import_started` | `surface` (`watchlist`/`try`), `input` (`image`/`text`), `images` (count), `page` | `components/import/import-button.tsx` (Portfolio), `components/import/import-workspace.tsx` (`/import`) | Who tries the screenshot import, and from where |
| `import_parsed` | `surface`, `input` (`image`/`text`/`csv`), `ok`, `via` (`rules`/`model`), `rows`, `matched`, `unknown`, `error_code` | same | Does reading work, how many rows are stocks we cover, which errors (`limit`, `model_failed`, `not_an_image`) |
| `import_saved` | `surface`, `added`, `updated`, `with_shares` (counts), `pending` (saved after signing in from `/import`) | same, after `/api/import/save` succeeds | Imports that became portfolios; how many `/import` visitors sign in to save |
| `thesis_saved` | `count`, `kinds` (comma list of reason kinds, `text` for typed only), `with_text`, `asked` | `components/thesis/thesis-step.tsx` | How many people answer "Why do you own this?" (never the typed text) |
| `portfolio_viewed` | `state` (`signed_out`/`empty`/`active`), `tracked_count`, `subscribed` | `components/radar-page-analytics.tsx` on `/watchlist` | Empty vs active portfolios |
| `agent_previewed` | `template`, `ok` | `components/agents-jobs/jobs-workspace.tsx` | Agent interest |
| `agent_switched_on` / `agent_paused` | `template`, `via` (`create`/`quick_start`/`toggle`) | same | Agents activation |
| `onboarding_*` | path, ticker | `components/post-signup-onboarding.tsx` | Post-signup onboarding (unchanged) |

Activation funnel (14-day window): `$pageview` → `signin_started` →
`user_signed_up` → `stock_tracked` → `stock_tracked` with `tracked_count >= 3`
→ `$pageview` of `/briefing` → `user_returned` with `days_since_first <= 7`.

### Conversion

| Event | Properties | Fired from | Answers |
|---|---|---|---|
| `paywall_shown` | `surface`, `feature`, `ticker`, `step` (`sign_in`/`upgrade`), `page` | `components/oa/gate.tsx` (every LockCard / MoreLocked), once per session per lock | Which gates people meet |
| `paywall_unlock_clicked` | same | same | Which gates get clicked |
| `limit_hit` | `feature` (lib/entitlements.ts id), `plan`, `limit`, `code`, `page` | Ask (`components/ask/ask-workspace.tsx`), full research (`components/research/launcher.tsx`), backtest, saved screens, follows, alerts, agents (saved paused), covered stocks (gate CoverButton, track button) | Which meters run out, by plan |
| `checkout_clicked` | `period`, `market`, `signed_in`, `surface`, `feature`, `page` | `components/pricing/plan-cards.tsx`, `lib/use-pro-checkout.ts` (gate locks pass their feature), `components/oa/pro-checkout-button.tsx` | Checkout intent by surface and gate |
| `checkout_failed` | `reason`, `surface` | same three | Broken checkouts and sign-in drop-off inside checkout |
| `checkout_started` | `period`, `market`, `trial_eligible`, `surface`, `feature` | **server**: `app/api/subscription/create-checkout/route.ts` | Checkout sessions created (the client sends the click's surface/feature; also stored on the user as `lastCheckoutSource`) |
| `checkout_returned` | `source` | `components/subscription-success-modal.tsx`, `components/subscription-activator.tsx` | The browser came back from Dodo paid (sets `plan=pro`) |
| `subscription_activated` | `plan`, `period`, `market`, `first_time`, `checkout_surface`, `checkout_feature` | **server**: `app/api/subscription/webhook/route.ts` on `subscription.active` | Paid conversions, and which gate converts |
| `subscription_renewed`, `subscription_payment_succeeded` | `period`/`plan` | **server**, webhook | Renewals |

Before this release the webhook sent `subscription_converted`; queries that
look at history include both names.

Every client event carries the `paywall` super property (`v1` today, `v2`
when the build has `PAYWALL_V2=1`, lib/paywall-flag.ts), and `checkout_started`
and `subscription_activated` carry it from the server. The funnel to compare
the two lines: activation (above) → `limit_hit` / `paywall_shown` →
`paywall_unlock_clicked` → `checkout_clicked` → `checkout_started` →
`subscription_activated` → `subscription_renewed`, split by `paywall` and by
`feature`. The briefing's "rest of your stocks moved too" card reports as
`paywall_shown` with `feature = briefing_personal`; a filing or news agent saved
paused on Free reports `limit_hit` with `feature = agent_events`.

### Engagement: what is working

| Event | Properties | Fired from | Answers |
|---|---|---|---|
| `stock_viewed` | `ticker`, `call`, `has_call`, `full_read`, `plan`, `is_tracked`, `has_ai_brief` | `components/stock-page-analytics.tsx` | Stock page views; doubles as "call viewed" |
| `read_viewed` | `ticker`, `call`, `full_read` | `components/track-view.tsx` at the end of the brief on the stock page | Do people read the brief |
| `read_expanded` | `section` (`news`, `timeline`), `ticker` | `Details` in `components/stock-report/primitives.tsx` | Depth of reading |
| `alert_created` | `ticker`, `kind` | `components/stock-report/alert-controls.tsx` | Alerts set |
| `insight_clicked` | `insight_id`, `insight_kind`, `tone`, `target` (`stock`/`action`/`action_2`; `ask`/`watch` under a stock's call), `ticker`, `href`, `page` | `components/oa/insight.tsx` (every The read row and the headline's next steps, declared); `components/stock-report/report.tsx` (the call's next steps, `insight_id` `stock-call`) | Which reads people act on, per page, and which next step they take (`href` says Ask or agents) |
| `earnings_report_opened` | `surface` (`stock_page`) | `components/earnings-day/stock-entry.tsx` (declared) | Do people open the earnings day report from the stock page (the briefing list sends `briefing_item_opened` with `kind=earnings_report`) |
| `research_entry_clicked` | `ticker` | `components/research/stock-entry.tsx` (declared, the "Full research" line on the stock page) | Does the stock page send people to the full research |
| `research_started` | `ticker`, `surface` (`research_page`), `again` (they already had a report on it), `page` | `components/research/launcher.tsx` on "Get the full research" | Who asks for a full report, on which stocks |
| `research_completed` | `ticker`, `seconds`, `removed` (sentences the numbers check took out) | same, when the saved report arrives | Do runs finish, how long they take, how often the check bites |
| `research_failed` | `ticker`, `code` (`limit`, `running`, `write_failed`, `no_evidence`, `sources_down`, `save_failed`, `not_configured`, `network`, `stream_ended`...), `step` | same | Where runs break; `limit` also sends `limit_hit` with `feature=deep_research` |
| `research_shared_cta` | `ticker` | `app/(app)/stock/[symbol]/research/s/[shareId]/page.tsx` (declared, "Get your own report" on a shared report) | Do shared reports bring new people |
| `briefing_item_opened` | `kind`, `ticker`, `relation`, `decision` | `components/briefing/briefing-group.tsx` | What in the briefing gets opened |
| `mover_opened` | `ticker`, `list` | Explore movers (`app/(app)/explore/page.tsx`), Signals movers (`components/signals/signals-view.tsx`) | Movers interest |
| `signal_opened` | `kind` (`reddit`/`policy`), `ticker` | Signals tabs | Which signals get opened |
| `screener_filter_applied` | `fields` (kinds of filter, never typed text), `active_count`, `preset` | `components/screener/filter-bar.tsx` | Which filters matter |
| `screen_saved` | `ok`, `reason` | `components/screener/save-screen.tsx` | Saved screens |
| `screener_exported` | `format` | screener page CSV link | Exports |
| `fund_opened` | `slug`, `list` | `components/follow/follow-directory.tsx` | Which funds/people get opened |
| `follow_clicked` | `slug`, `followed`, `signed_in`, `outcome` | `components/follow/follow-button.tsx` | Follows |
| `agent_report_opened` | `template`, `has_report` | agents workspace | Do agent reports get read |
| `ask_question_asked` | `origin` (`typed`/`link`/`suggestion`), `turn`, `length` bucket | `components/ask/ask-workspace.tsx` | Ask usage (never the question text) |
| `ask_answer_received` | `latency_ms`, `turn` | same | Ask latency |
| `ask_answer_failed` | `reason` (`limit`/`error`/`aborted`), `status`, `message` (error code) | same | Ask failures |
| `ask_ai_clicked` | `surface`, `ticker` | `components/watchlist-ai-prompt-button.tsx` | Ask entry points |
| `backtest_run` | `ok`, `holdings`, `tickers` (≤10), `rebalance`, `benchmark`, `error_code`, `origin` | `components/backtest/backtest-workbench.tsx` | Backtests |
| `compare_run` | `tickers` (≤6), `count` | `components/compare-desk/picker.tsx` | Compares |
| `search_performed` | `surface`, `query`, `results_count`, `found`, `ticker` | header and hero search (`components/oa/oa-header-search-button.tsx`, `oa-hero-search.tsx`); no-result queries after a 1.2s pause | What people look for, and what we lack |
| `stock_search_selected`, `stock_request_clicked`, `stock_request_*` | ticker / query | search components, request modal | Kept from before |
| `market_status_cta_clicked`, `attribution_submitted`, `agent_access_action`, `landing_cta_clicked` | as before (`landing_cta_clicked` with `surface=hero_import` is the "See what we think of yours" link under the hero card, declared) | as before | Kept |

### Removed in this release

`market_status_impression` (one per page load, answered nothing),
`subscription_plan_clicked` (duplicate of `checkout_clicked`), the
browser-side `checkout_started` (double-counted the server one),
`subscribe_signin_*` (now `signin_*` with `surface=subscribe_pricing`),
`radar_add_intent`/`radar_add_clicked`/`radar_stock_added`/`radar_first_stock_added`/`radar_add_picker_opened`/`radar_remove_clicked`/`radar_signin_*`
(now `stock_track_clicked` plus server `stock_tracked`/`stock_untracked`),
`radar_free_limit_blocked` (now `limit_hit`), `alert_set_clicked` (now
`alert_created`), `radar_viewed` (now `portfolio_viewed`), and email and name
on `identify`.

## Scripts

- `node scripts/analytics/audit-events.mjs [days]`: what actually arrived, by
  event, area, identify health and environment, and which planned events are
  missing. Needs a personal API key with `query:read`.
- `node scripts/analytics/create-dashboard.mjs`: creates or updates
  **stocksbrew: growth** and verifies every tile loads. `--dry-run` prints
  the queries, `--verify` only checks. Needs `dashboard:write`,
  `insight:write` and `query:read`.

Both read `POSTHOG_TOKEN` (or `POSTHOG_PERSONAL_API_KEY`) and
`POSTHOG_PROJECT_ID` from the environment or `.env.local`, and never print them.
