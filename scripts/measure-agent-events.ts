/**
 * How often the SEC filing and news agents would have fired over the last
 * four weeks, per stock, for the 20 biggest US stocks. Read-only: it reads the
 * production store through the same loaders as the runner and writes nothing.
 * Used to tune NEWS_RULES (lib/agent-events-news.ts) and MAJOR_ITEMS
 * (lib/agent-events-filings.ts) so a watch fires about once or twice a month.
 *
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/measure-agent-events.ts
 */
export {};

const TOP = ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "AVGO", "TSLA", "BRK.B", "LLY", "JPM", "WMT", "V", "ORCL", "MA", "XOM", "NFLX", "COST", "JNJ", "HD"];

async function main() {
  const { adminFirestore } = await import("@/lib/firebase-admin");
  const { loadFilingFacts, loadNewsFacts } = await import("@/lib/agent-events-data");
  const { NEWS_RULES, newsSignals } = await import("@/lib/agent-events-news");
  const { EMPTY_FACTS, addDays, replayJob } = await import("@/lib/agent-jobs");
  const { agentMarketDay } = await import("@/lib/agent-jobs-data");

  const spy = (await adminFirestore.collection("tm_price_history_daily").doc("SPY").get()).data() as { dates: string[] };
  const today = agentMarketDay();
  const calendar = spy.dates.filter((day) => day < today);
  const end = calendar[calendar.length - 1];
  const from = addDays(end, -7 * 4);
  const sessions = calendar.filter((day) => day > from && day <= end);
  console.log(`Window: ${sessions[0]} to ${end}, ${sessions.length} sessions`);

  const started = Date.now();
  const [filings, news] = await Promise.all([loadFilingFacts(addDays(end, -40)), loadNewsFacts(TOP, addDays(end, -46), calendar)]);
  console.log(`Reads: ${filings?.length ?? 0} filings, ${news?.stories.length ?? 0} stories, ${Object.keys(news?.tones ?? {}).length} tone labels in ${Date.now() - started} ms`);
  console.log(`Headlines kept from ${news?.coverage_from}, tone from ${news?.tone_from}`);

  const facts = {
    ...EMPTY_FACTS,
    filings: filings ?? [],
    news: news ?? undefined,
    available: { ...EMPTY_FACTS.available, filings: Boolean(filings?.length), news: Boolean(news?.coverage_from) },
  };

  const rate = (counts: number[]) => {
    const total = counts.reduce((sum, value) => sum + value, 0);
    return `${total} fires, ${(total / counts.length).toFixed(2)} per stock per 4 weeks, max ${Math.max(...counts)}, stocks with none ${counts.filter((value) => value === 0).length}`;
  };

  console.log("\nSEC filings (replayJob, one job per stock):");
  const filingWatches = [
    { label: "any filing", filings: undefined },
    { label: "something big", filings: { major: true } },
    { label: "8-K any item", filings: { forms: ["8-K"] } },
    { label: "8-K 5.02", filings: { forms: ["8-K"], items: ["5.02"] } },
    { label: "8-K 1.01", filings: { forms: ["8-K"], items: ["1.01"] } },
    { label: "10-K or 10-Q", filings: { forms: ["10-K", "10-Q"] } },
  ] as const;
  for (const watch of filingWatches) {
    const counts = TOP.map((ticker) => {
      const replay = replayJob(
        { trigger: { type: "event", event: "sec_filing", ...(watch.filings ? { filings: watch.filings as never } : {}) }, scope: { kind: "tickers", tickers: [ticker] } },
        facts,
        { end, tickers: [ticker], calendar },
      );
      return replay.counts.notify;
    });
    console.log(`  ${watch.label.padEnd(16)} ${rate(counts)}  [${TOP.map((t, i) => `${t}:${counts[i]}`).join(" ")}]`);
  }

  // The whole covered universe, for the item mix behind MAJOR_ITEMS.
  const universe = [...new Set((filings ?? []).map((filing) => filing.ticker))];
  for (const watch of filingWatches) {
    let fired = 0;
    for (const ticker of universe) {
      const replay = replayJob(
        { trigger: { type: "event", event: "sec_filing", ...(watch.filings ? { filings: watch.filings as never } : {}) }, scope: { kind: "tickers", tickers: [ticker] } },
        facts,
        { end, tickers: [ticker], calendar },
      );
      fired += replay.counts.notify;
    }
    console.log(`  universe ${watch.label.padEnd(16)} ${fired} fires over ${universe.length} filers, ${(fired / universe.length).toFixed(2)} per filer per 4 weeks`);
  }

  if (!news) return;
  console.log("\nNews (replayJob with the shipped rules, one job per stock):");
  for (const watch of ["any", "busy", "negative", "positive", "tone"] as const) {
    const rows = TOP.map((ticker) => replayJob({ trigger: { type: "event", event: "news", news: watch }, scope: { kind: "tickers", tickers: [ticker] } }, facts, { end, tickers: [ticker], calendar }).counts);
    const checked = rows.reduce((sum, row) => sum + row.notify + row.nothing, 0) / TOP.length;
    console.log(`  ${watch.padEnd(9)} ${rate(rows.map((row) => row.notify))}; checkable sessions per stock ${checked.toFixed(1)} of ${sessions.length}  [${TOP.map((t, i) => `${t}:${rows[i].notify}`).join(" ")}]`);
  }

  // Grid over the rules, one window per session (as a daily runner would), per checkable stock-session.
  // `allHeadlines`: also use the days before today's sources (a thinner feed), as a rough proxy until the
  // current sources have a few weeks behind them. `hindsightTone`: use every tone label whenever it was written.
  const firstStoryDay = news.stories.map((story) => story.day).sort()[0] ?? null;
  const grid = (rules: typeof NEWS_RULES, hindsightTone: boolean, allHeadlines = false) => {
    const tones = hindsightTone ? Object.fromEntries(Object.entries(news.tones).map(([id, label]) => [id, { ...label, scored_at: "2000-01-01T00:00:00.000Z" }])) : news.tones;
    const input = {
      ...news,
      tones,
      tone_from: hindsightTone ? "2000-01-01T00:00:00.000Z" : news.tone_from,
      coverage_from: allHeadlines && firstStoryDay ? addDays(firstStoryDay, 1) : news.coverage_from,
    };
    let busy = 0, busyChecked = 0, lean = 0, leanChecked = 0;
    let previous: string | null = calendar[calendar.indexOf(sessions[0]) - 1] ?? null;
    for (const day of sessions) {
      const result = newsSignals(input, { day, since: previous, tickers: TOP }, rules);
      const toneDay = Object.values(news.tones).some((label) => label.scored_at.slice(0, 10) <= day) || hindsightTone;
      for (const signal of result.signals) {
        if (result.volumeReady) { busyChecked += 1; if (signal.busy) busy += 1; }
        if (result.toneReady && toneDay && signal.read > 0) { leanChecked += 1; if (signal.lean) lean += 1; }
      }
      previous = day;
    }
    const perMonth = (fires: number, checked: number) => (checked ? ((fires / checked) * 21).toFixed(2) : "n/a");
    return `busy ${busy}/${busyChecked} stock-sessions (${perMonth(busy, busyChecked)} a month per stock), one-sided ${lean}/${leanChecked} (${perMonth(lean, leanChecked)} a month per stock)`;
  };
  console.log("\nNews rules grid (per stock-session that could be checked; 21 sessions a month):");
  for (const ratio of [2, 2.5, 3, 4]) {
    for (const min of [4, 6, 8]) {
      console.log(`  ratio ${ratio} min ${min}: ${grid({ ...NEWS_RULES, busyRatio: ratio, busyMinStories: min }, false)}`);
      console.log(`    proxy with the older, thinner feed (dominated by the Nov 10 source change): ${grid({ ...NEWS_RULES, busyRatio: ratio, busyMinStories: min }, false, true)}`);
    }
  }
  for (const share of [50, 60, 65, 70]) {
    for (const min of [3, 4, 5, 6]) {
      for (const turn of [true]) {
        console.log(`  tone ${share}% of at least ${min}, on turn ${turn}: ${grid({ ...NEWS_RULES, toneSharePct: share, toneMinStories: min, onTurnOnly: turn }, true)}`);
      }
    }
  }
}

await main().catch((error) => {
  console.error("[measure-agent-events] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
