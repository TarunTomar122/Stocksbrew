#!/usr/bin/env node
/**
 * Reddit Snapshot for tikrr
 *
 * Fetches hot posts from 6 investing subreddits via RSS (Reddit blocks
 * JSON API from servers), extracts stock tickers and sentiment via
 * the configured OpenAI model, and stores the snapshot in Firestore.
 *
 * Collection: reddit_snapshots/{DATE} and reddit_snapshots/latest
 *
 * Note: RSS doesn't expose scores or comment counts. Ticker extraction
 * relies on title/content analysis only.
 *
 * Designed to run as a cron job at market open (9:35 AM ET weekdays).
 */

const admin = require("firebase-admin");
const path = require("path");
const https = require("https");

// ─── Init ─────────────────────────────────────────────────────────────────────
const saPath = path.resolve(__dirname, "..", "backend", "firebase-service-account.json");
const sa = require(saPath);
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// ─── Config ───────────────────────────────────────────────────────────────────
const SUBREDDITS = [
  "wallstreetbets",
  "stocks",
  "investing",
  "StockMarket",
  "options",
  "shortsqueeze",
];

const USER_AGENT = "tikrr-reddit-snapshot/1.0 (by /u/tikrr_bot)";

// Cheap high-volume work stays on direct OpenAI Luna with low reasoning.
const LLM_API_URL = "https://api.openai.com/v1/chat/completions";
const LLM_API_KEY = process.env.OPENAI_API_KEY || "";
const LLM_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function llmAvailable() {
  return LLM_API_KEY.length > 0;
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const req = https.get(
      {
        hostname: opts.hostname,
        path: opts.pathname + opts.search,
        headers: { "User-Agent": USER_AGENT },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode === 429) {
            const retryAfter = parseInt(res.headers["retry-after"] || "30", 10);
            reject(new Error(`Rate limited (429). Retry after ${retryAfter}s`));
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          resolve(data);
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

function callLLM(systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const url = new URL(LLM_API_URL);
    const body = JSON.stringify({
      model: LLM_MODEL,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: "POST",
      headers: {
        Authorization: `Bearer ${LLM_API_KEY}`,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`LLM ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.message?.content;
          if (!content) {
            reject(new Error("LLM returned empty content"));
            return;
          }
          let clean = content.trim();
          if (clean.startsWith("```")) {
            const lines = clean.split("\n");
            if (lines[0].startsWith("```")) lines.shift();
            if (lines[lines.length - 1] === "```") lines.pop();
            clean = lines.join("\n").trim();
          }
          resolve(JSON.parse(clean));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("LLM request timeout"));
    });
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Strip HTML tags and decode entities to plain text */
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


// ─── RSS Fetch ────────────────────────────────────────────────────────────────

/** Parse Atom XML entries using regex (avoids entity expansion limits) */
function parseAtomEntries(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
    const getTag = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`));
      return m ? m[1].trim() : "";
    };
    const title = stripHtml(getTag("title"));
    const id = getTag("id");
    const content = getTag("content");
    const authorName = (() => {
      const m = block.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/);
      return m ? m[1].trim() : "";
    })();
    const linkMatch = block.match(/<link[^>]*href="([^"]+)"/);
    const published = getTag("published") || getTag("updated");
    entries.push({ title, id, content, authorName, link: linkMatch ? linkMatch[1] : "", published });
  }
  return entries;
}

async function fetchSubredditPosts(subreddit) {
  const url = `https://www.reddit.com/r/${subreddit}/hot.rss`;
  try {
    const xml = await fetchText(url);
    const entries = parseAtomEntries(xml);

    const posts = entries
      .filter((e) => e.title)
      .map((e) => {
        const selftext = stripHtml(e.content);
        const postId = e.id.replace("t3_", "");

        return {
          id: postId || null,
          subreddit,
          title: e.title,
          selftext: selftext.slice(0, 500),
          url: e.link || null,
          author: e.authorName || null,
          published: e.published || null,
        };
      });

    console.log(`  ✓ r/${subreddit}: ${posts.length} posts`);
    return posts;
  } catch (e) {
    console.error(`  ✗ r/${subreddit}: ${e.message}`);
    return [];
  }
}

// ─── Ticker Extraction via LLM ────────────────────────────────────────────────

const TICKER_SYSTEM = `You are a sharp market analyst writing for traders. Your tone is punchy, direct, and reads like a Bloomberg terminal note or a trading desk morning brief.

Given Reddit post titles and bodies about stocks, extract:

1. "tickers" - map of ticker → {
     mentions: number,
     sentiment: "bullish" | "bearish" | "neutral",
     context: 2-3 sentences. Write like a trading desk note. Focus on WHAT is happening with the stock (price action, news, catalysts, sector moves). Do NOT say "users are saying" or "traders are discussing". Write as if you're explaining the situation to someone who missed the move. Include specific numbers/percentages when available.
     catalysts: array of 1-3 short phrases - the actual catalysts driving chatter (e.g. "H200 chip sales to China cleared", "Q1 earnings beat", "Samsung strike disrupts HBM supply")
   }
2. "market_mood" - "bullish" | "bearish" | "mixed" | "neutral"
3. "top_themes" - up to 5 dominant themes (e.g. "AI infrastructure", "Fed policy", "short squeeze plays")
4. "notable_posts" - up to 5 posts with { title, subreddit, why_notable }

Rules for context:
- NEVER start with "users are..." or "traders are..." or "investors are..."
- Lead with the catalyst or the price action
- Use trading shorthand: "catching a bid", "ripping", "dumping", "in play", "on the radar"
- Be specific: include the stock move %, the news, the sector context
- GOOD: "NVDA ripping on H200 chip clearance to China. Jensen joining trade delegation adds fuel. AI names still in favor - some degens sitting on 1240% gains."
- GOOD: "Micron catching a bid on Samsung strike fears disrupting HBM supply. Memory names looking like the next rotation."
- BAD: "Users are expressing excitement over significant gains and positive news related to Nvidia."
- BAD: "Investors believe MU will benefit from a potential Samsung strike."

Rules for tickers:
- Only valid US stock tickers (1-5 uppercase letters). No crypto.
- Not tickers: THE, A, AN, IS, IT, BE, TO, IN, FOR, ON, MY, I, CEO, IPO, ETF, DD, YOLO, FOMO, ATH, EPS, SEC, FDA, GDP, CPI, FED, PCE, RSI, GTC, RH, OP, PM, AM, RE, VS, BEAR, BULL, LOSS, GAIN, PUT, CALL, CALLS, PUTS, tendies, regard
- Return valid JSON only.`;

async function extractTickersFromPosts(posts) {
  const lines = posts.map(
    (p, i) =>
      `[${i + 1}] r/${p.subreddit}${p.author ? " | " + p.author : ""}\n    ${p.title}${p.selftext ? "\n    " + p.selftext.slice(0, 200) : ""}`
  );

  // Batch into groups of ~30 to stay within LLM context
  const BATCH = 30;
  const batches = [];
  for (let i = 0; i < lines.length; i += BATCH) {
    batches.push(lines.slice(i, i + BATCH));
  }

  const allTickers = {};
  let moods = [];
  let allThemes = [];
  let allNotable = [];

  for (const batch of batches) {
    const userPrompt = `Extract stock tickers and sentiment from these Reddit posts:\n\n${batch.join("\n\n")}`;
    try {
      const result = await callLLM(TICKER_SYSTEM, userPrompt);

      if (result.tickers) {
        for (const [sym, info] of Object.entries(result.tickers)) {
          if (allTickers[sym]) {
            allTickers[sym].mentions += info.mentions || 1;
            if (info.sentiment === "bullish" && allTickers[sym].sentiment !== "bullish")
              allTickers[sym].sentiment = "bullish";
            if (info.sentiment === "bearish" && allTickers[sym].sentiment !== "bearish")
              allTickers[sym].sentiment = "bearish";
            // Merge catalysts
            if (info.catalysts) {
              const existing = new Set(allTickers[sym].catalysts || []);
              for (const c of info.catalysts) existing.add(c);
              allTickers[sym].catalysts = [...existing].slice(0, 5);
            }
          } else {
            allTickers[sym] = {
              mentions: info.mentions || 1,
              sentiment: info.sentiment || "neutral",
              context: info.context || "",
              catalysts: info.catalysts || [],
            };
          }
        }
      }

      if (result.market_mood) moods.push(result.market_mood);
      if (result.top_themes) allThemes.push(...result.top_themes);
      if (result.notable_posts) allNotable.push(...result.notable_posts);
    } catch (e) {
      console.error(`  ⚠ LLM ticker extraction failed: ${e.message}`);
    }

    if (batches.length > 1) await sleep(1000);
  }

  // Sort tickers by mention count
  const sortedTickers = Object.entries(allTickers)
    .sort((a, b) => b[1].mentions - a[1].mentions)
    .slice(0, 30);

  // Determine overall mood
  const moodCounts = {};
  for (const m of moods) moodCounts[m] = (moodCounts[m] || 0) + 1;
  const overallMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";

  // Deduplicate themes
  const themeCounts = {};
  for (const t of allThemes) {
    const key = t.toLowerCase().trim();
    themeCounts[key] = (themeCounts[key] || 0) + 1;
  }
  const topThemes = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  // Deduplicate notable posts
  const seenTitles = new Set();
  const notablePosts = [];
  for (const p of allNotable) {
    const key = (p.title || "").toLowerCase().slice(0, 50);
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      notablePosts.push(p);
      if (notablePosts.length >= 5) break;
    }
  }

  return {
    tickers: Object.fromEntries(sortedTickers),
    market_mood: overallMood,
    top_themes: topThemes,
    notable_posts: notablePosts,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  console.log(`[reddit-snapshot] running at ${now.toISOString()}\n`);

  if (!llmAvailable()) {
    console.warn("⚠ No LLM API key. Ticker extraction will be skipped.\n");
  }

  // 1. Fetch posts from all subreddits via RSS
  console.log("Fetching posts from subreddits (RSS)...");
  const allPosts = [];
  for (const sub of SUBREDDITS) {
    const posts = await fetchSubredditPosts(sub);
    allPosts.push(...posts);
    await sleep(1000); // be polite to Reddit
  }

  console.log(`\nTotal posts fetched: ${allPosts.length}`);

  if (allPosts.length === 0) {
    console.error("No posts fetched from any subreddit. Aborting.");
    process.exit(1);
  }

  // 2. Extract tickers and sentiment via LLM
  let analysis = {
    tickers: {},
    market_mood: "neutral",
    top_themes: [],
    notable_posts: [],
  };

  if (llmAvailable()) {
    console.log("\nExtracting tickers and sentiment via LLM...");
    analysis = await extractTickersFromPosts(allPosts);
    console.log(`  ✓ Found ${Object.keys(analysis.tickers).length} tickers`);
    console.log(`  ✓ Market mood: ${analysis.market_mood}`);
    console.log(`  ✓ Themes: ${analysis.top_themes.join(", ")}`);
  }

  // 3. Per-subreddit stats
  const subredditStats = {};
  for (const sub of SUBREDDITS) {
    const subPosts = allPosts.filter((p) => p.subreddit === sub);
    subredditStats[sub] = { post_count: subPosts.length };
  }

  // 4. Build snapshot
  const snapshot = {
    market: "US",
    generated_at: now.toISOString(),
    date: dateStr,
    source: "rss",
    post_count: allPosts.length,
    subreddit_count: SUBREDDITS.length,
    subreddits: SUBREDDITS,
    subreddit_stats: subredditStats,
    market_mood: analysis.market_mood,
    top_themes: analysis.top_themes,
    tickers: analysis.tickers,
    ticker_count: Object.keys(analysis.tickers).length,
    notable_posts: analysis.notable_posts,
    posts: allPosts.map((p) => ({
      id: p.id,
      subreddit: p.subreddit,
      title: p.title,
      selftext: p.selftext,
      url: p.url,
      author: p.author,
      published: p.published,
    })),
  };

  // 5. Write to Firestore
  const docId = `US__${dateStr}`;
  await db.collection("reddit_snapshots").doc(docId).set(snapshot);
  console.log(`\n✅ Wrote reddit_snapshots/${docId}`);

  await db.collection("reddit_snapshots").doc("US__latest").set(snapshot);
  console.log(`✅ Wrote reddit_snapshots/US__latest`);

  // 6. Print summary
  console.log(`\n📊 Reddit Snapshot Summary`);
  console.log(`  Posts: ${allPosts.length} from ${SUBREDDITS.length} subreddits`);
  console.log(`  Market mood: ${analysis.market_mood}`);
  console.log(`  Top tickers:`);
  const top10 = Object.entries(analysis.tickers).slice(0, 10);
  for (const [sym, info] of top10) {
    const emoji = info.sentiment === "bullish" ? "🟢" : info.sentiment === "bearish" ? "🔴" : "⚪";
    const cats = (info.catalysts || []).slice(0, 3).join(", ");
    console.log(`    ${emoji} $${sym}: ${info.mentions} mentions (${info.sentiment}) - ${info.context}`);
    if (cats) console.log(`       ↳ ${cats}`);
  }
  if (analysis.top_themes.length) {
    console.log(`  Themes: ${analysis.top_themes.join(", ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  });
