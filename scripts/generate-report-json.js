#!/usr/bin/env node
/**
 * Generate weekly report JSON for email broadcast.
 * Reads from Firestore (tm_daily_anomalies + tm_weekly_reports) and outputs
 * a JSON file that send-weekly-broadcast.py reads.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const sa = require(path.join(__dirname, '../backend/firebase-service-account.json'));
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
const db = admin.firestore();

const DOMAINS = {
  DOCN: 'digitalocean.com', MU: 'micron.com', INTC: 'intel.com',
  AMD: 'amd.com', NET: 'cloudflare.com', APTV: 'aptiv.com', EXPE: 'expedia.com',
};

async function main() {
  // Get latest weekly report from Firestore
  let weekSnap = await db.collection('tm_weekly_reports').doc('US__latest').get();
  if (!weekSnap.exists) {
    const allWeeks = await db.collection('tm_weekly_reports').get();
    if (allWeeks.empty) {
      console.error('No weekly reports found in Firestore');
      process.exit(1);
    }
    // Get the lexicographically latest (date-sorted doc ids)
    const sorted = allWeeks.docs.filter(d => d.id !== 'US__latest').sort((a, b) => b.id.localeCompare(a.id));
    weekSnap = sorted[0] || allWeeks.docs[0];
    console.log('Using latest report:', weekSnap.id);
  }
  const weekData = weekSnap.data();

  // Derive dates from week_ending and days_covered
  const endDate = new Date(weekData.week_ending);
  const dates = [];
  for (let i = weekData.days_covered - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  console.log(`Dates: ${dates.join(', ')}`);

  // Aggregate anomalies across the week
  const allAnomalies = {};
  for (const date of dates) {
    const snap = await db.collection('tm_daily_anomalies').doc(`US__${date}`).get();
    if (!snap.exists) continue;
    const anomalies = snap.data().anomalies || [];
    for (const a of anomalies) {
      if (!allAnomalies[a.ticker]) {
        allAnomalies[a.ticker] = {
          name: a.name, domain: a.domain,
          max_change: a.day_change_pct || 0,
          min_change: a.day_change_pct || 0,
          headlines: a.headlines || [],
          catalyst: a.catalyst || '',
          today_brief: a.today_brief || '',
        };
      } else {
        allAnomalies[a.ticker].max_change = Math.max(allAnomalies[a.ticker].max_change, a.change_pct);
        allAnomalies[a.ticker].min_change = Math.min(allAnomalies[a.ticker].min_change, a.change_pct);
        // Merge headlines
        for (const h of (a.headlines || [])) {
          if (!allAnomalies[a.ticker].headlines.includes(h)) {
            allAnomalies[a.ticker].headlines.push(h);
          }
        }
        if (a.today_brief && !allAnomalies[a.ticker].today_brief) {
          allAnomalies[a.ticker].today_brief = a.today_brief;
        }
      }
    }
  }

  // Build tickers: use the biggest move (max if positive, min if negative)
  const tickers = {};
  for (const [ticker, data] of Object.entries(allAnomalies)) {
    const biggestMove = Math.abs(data.max_change) > Math.abs(data.min_change) ? data.max_change : data.min_change;
    const desc = data.today_brief || data.headlines[0] || data.catalyst || '';
    tickers[ticker] = {
      name: data.name,
      domain: data.domain || DOMAINS[ticker] || '',
      change: Math.round(biggestMove * 100) / 100,
      desc: desc.length > 160 ? desc.slice(0, 157) + '...' : desc,
    };
  }

  // Default themes and watch items (agent enriches these via cron)
  const defaultThemes = [
    { title: 'Memory is the new GPU', detail: 'DRAM/NAND shortages driving prices. Hyperscaler capex heading to $1T.' },
    { title: 'Intel comeback is real', detail: 'Apple deal validates manufacturing pivot. Gov stake worth 6x.' },
    { title: 'AI layoffs spook investors', detail: 'Cloudflare\'s "beat and cut" rattled markets.' },
    { title: 'Beats aren\'t enough', detail: 'Market wants forward momentum, not backward-looking results.' },
  ];
  const defaultWatch = [
    'Memory chip prices \u2014 if DRAM keeps climbing, MU has room to run',
    'Intel follow-through \u2014 Apple deal confirmation could push toward $150',
    'AI layoff contagion \u2014 more "beat and cut" could shift sentiment',
    'Consumer softness \u2014 EXPE guidance may signal broader travel weakness',
  ];

  const report = {
    week_label: `Week of ${dates[0]} to ${dates[dates.length - 1]}`,
    headline: (weekData.narrative && weekData.narrative.headline) || 'The AI Chip Rally Went Parabolic',
    subheadline: (weekData.narrative && weekData.narrative.subheadline) || 'Memory chips are the new bottleneck. Micron had its best week since 2008.',
    indices: weekData.indices || {
      sp500: { change: 2.3, value: '7,398' },
      nasdaq: { change: 4.5, value: '26,247', label: 'ATH' },
    },
    themes: (weekData.key_themes && weekData.key_themes.length) ? weekData.key_themes : defaultThemes,
    watch_next: (weekData.what_to_watch && weekData.what_to_watch.length) ? weekData.what_to_watch : defaultWatch,
    anomaly_count: (weekData.summary_stats && weekData.summary_stats.total_anomaly_events) || 16,
    anomaly_stocks: (weekData.summary_stats && weekData.summary_stats.unique_tickers_affected) || Object.keys(tickers).length,
    tickers,
  };

  const outPath = '/tmp/tikrr_weekly_report.json';
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Report written to ${outPath}`);
  console.log(`Tickers: ${Object.keys(tickers).join(', ')}`);
  console.log(`Themes: ${report.themes.length}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
