# Radar Pro plan — the hook and the play

Goal: turn Radar from a static readout into a loop people return to, and give
free users a reason to convert. Target ~10 paying users / ~$100 MRR.

## The core problem

Radar today shows information but has no hook. A readout you check once. A loop
you return to because something is unresolved and you have a stake in it. We are
missing three things: proof the calls work, an open loop, and personal stake.

## What the data supports (confirmed 2026-06-23)

- **Earnings "called it" feed** — `lib/track-record.ts` ALREADY scores past
  pre-earnings predictions against the real day move. Computed, never surfaced.
- **1-year price history** — `tm_latest_prices.history_window`, timestamped,
  kept day over day. Enough to compute "+X% since <date>".
- **Directive history** — NEW as of 2026-06-23: every run appends
  `{stance, price_at_call, generated_at}` to
  `tm_directive_history/{instrument_id}/calls/{YYYY-MM-DD}`. Fills over time.
- Missing / needs work: per-day anomaly archive (currently `__latest` only),
  per-stock "N users track this" social-proof counts.

## Free users: the hook is PROOF, not features

Sell a track record they can't argue with, not "track 3 stocks":

1. **"Called it" receipts** — "stocksbrew said ACCUMULATE NVDA at $180. It's
   $228 now. +27% since the call." Live feed of resolved winning calls. This is
   the single best free->pro converter: earned FOMO, not a promise.
2. **Wave framing** — "These 3 are riding the AI-capex wave" with the entry the
   system flagged, locked behind track.
3. **Borrowed proof** — "NVDA is on N radars" once we have the counts.

The free page should feel like watching someone win and being one tap from in.

## Pro users: PLAY = every call is a scored bet

Reframe a directive from a table row into an open position you are winning or
losing. Ranked by value:

1. **The scoreboard** — every call scored on outcome. "Your radar: 14 of 19 in
   the money, +8.3% avg." Proof and play in one; a table becomes a leaderboard
   against the market.
2. **You vs market vs stocksbrew** — three-way running P&L. "If you'd followed
   every call: +12%. You did 9 of 14." Loss aversion + curiosity.
3. **Pending plays / open loops** — "3 calls waiting on a trigger." The alert
   firing is the payoff; this is what makes them return.
4. **Streaks** — "stocksbrew's hit streak on your book: 6." Cleanest game loop.
5. **Predict-then-reveal on earnings** — user guesses beat/miss, we reveal our
   call + the result. Active participation beats passive reading.

## Ethical guardrail (also strategic)

Reward being RIGHT over time — patience, good entries, calls that aged well —
never clicks or trades. Gamifying activity drives overtrading, burns the user,
and kills a retention product. Rewarding accuracy is both honest and what
actually retains paying users.

## Roadmap

- **Phase 0 (done 2026-06-23):** persist directive history with entry price.
- **Phase 1 (now):** ship the earnings "called it" feed as the free hook —
  already computed, zero pipeline cost.
- **Phase 2 (after ~2-3 weeks of history):** Pro scoreboard + returns-since-call
  from `tm_directive_history` x price history. Add a light scoring job or do it
  read-time.
- **Phase 3:** streaks, you-vs-market P&L, pending-plays loop.
- **Phase 4 (needs new data):** anomaly/movers day-over-day archive; per-stock
  track counts for social proof.
