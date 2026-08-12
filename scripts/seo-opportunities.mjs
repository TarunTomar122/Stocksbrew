#!/usr/bin/env node

/**
 * Turn a Search Console export into a small, repeatable SEO queue.
 *
 * Usage:
 *   node scripts/seo-opportunities.mjs /path/to/export
 *   node scripts/seo-opportunities.mjs /path/to/export --out output/seo-opportunities.json
 */

import fs from "node:fs/promises";
import path from "node:path";

const inputDir = process.argv[2];
if (!inputDir) {
  console.error("Usage: node scripts/seo-opportunities.mjs <search-console-export-dir> [--out <file>]");
  process.exit(1);
}

const outIndex = process.argv.indexOf("--out");
const outputPath = outIndex === -1 ? null : process.argv[outIndex + 1];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }

  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
}

async function readExport(name) {
  const file = path.join(inputDir, name);
  try {
    return parseCsv(await fs.readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Missing ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function number(value) {
  return Number.parseFloat(String(value ?? "").replaceAll(",", "").replace("%", "")) || 0;
}

function cleanUrl(value) {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

function genericQuery(query) {
  return !/stocksbrew|tikrr|stocksbrew\.online/i.test(query);
}

function classifyIntent(query) {
  const value = query.toLowerCase();
  if (/\b(compare|versus|vs\.?|alternative|difference)\b/.test(value)) return "comparison";
  if (/\b(how|what|why|meaning|guide|explained|definition)\b/.test(value)) return "education";
  if (/\b(buy|best|should i|price target|forecast|alert|tool|app)\b/.test(value)) return "decision";
  return "market";
}

function tokenize(value) {
  return new Set(
    value
      .toLowerCase()
      .replace(/https?:\/\/[^/]+/, "")
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 3 && !["stock", "stocks", "best", "free", "2026"].includes(token)),
  );
}

const [pages, queries] = await Promise.all([readExport("Pages.csv"), readExport("Queries.csv")]);

const quickWins = pages
  .map((row) => ({
    url: cleanUrl(row["Top pages"]),
    clicks: number(row.Clicks),
    impressions: number(row.Impressions),
    ctr: number(row.CTR),
    position: number(row.Position),
  }))
  .filter((row) => row.impressions >= 10 && row.position >= 5 && row.position <= 20 && row.ctr < 5)
  .sort((a, b) => b.impressions - a.impressions || a.position - b.position);

const queryOpportunities = queries
  .map((row) => ({
    query: row["Top queries"].trim(),
    clicks: number(row.Clicks),
    impressions: number(row.Impressions),
    ctr: number(row.CTR),
    position: number(row.Position),
    intent: classifyIntent(row["Top queries"]),
  }))
  .filter((row) => genericQuery(row.query) && row.impressions >= 10 && row.position >= 5 && row.position <= 30 && row.ctr < 5)
  .sort((a, b) => b.impressions - a.impressions || a.position - b.position);

const lowCtrPageOne = pages
  .map((row) => ({
    url: cleanUrl(row["Top pages"]),
    impressions: number(row.Impressions),
    ctr: number(row.CTR),
    position: number(row.Position),
  }))
  .filter((row) => row.impressions >= 20 && row.position <= 10 && row.ctr < 3)
  .sort((a, b) => b.impressions - a.impressions);

const contentQualityReview = pages
  .map((row) => ({
    url: cleanUrl(row["Top pages"]),
    clicks: number(row.Clicks),
    impressions: number(row.Impressions),
    ctr: number(row.CTR),
    position: number(row.Position),
  }))
  .filter((row) => row.impressions >= 20 && row.clicks === 0)
  .sort((a, b) => b.impressions - a.impressions);

const pageTokens = pages
  .map((row) => ({ url: cleanUrl(row["Top pages"]), tokens: tokenize(row["Top pages"]) }))
  .filter(({ tokens }) => tokens.size >= 2);
const cannibalizationCandidates = [];
for (let left = 0; left < pageTokens.length; left += 1) {
  for (let right = left + 1; right < pageTokens.length; right += 1) {
    const shared = [...pageTokens[left].tokens].filter((token) => pageTokens[right].tokens.has(token));
    if (shared.length >= 2) cannibalizationCandidates.push({ pages: [pageTokens[left].url, pageTokens[right].url], sharedTerms: shared });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  source: inputDir,
  method: {
    quickWin: "10+ impressions, position 5-20, CTR below 5%",
    pageOneCtr: "20+ impressions, position 1-10, CTR below 3%",
    queryGate: "generic query, 10+ impressions, position 5-30, CTR below 5%",
    intent: "rule-based query classification for prioritization; confirm intent from the actual SERP",
    contentQuality: "20+ impressions with zero clicks; performance proxy for manual title, description, and page-content review",
    cannibalization: "heuristic URL-token overlap only; confirm with query-to-page data before changing pages",
  },
  quickWins,
  lowCtrPageOne,
  queryOpportunities,
  contentQualityReview,
  cannibalizationCandidates: cannibalizationCandidates.slice(0, 50),
};

if (outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify(report, null, 2));
