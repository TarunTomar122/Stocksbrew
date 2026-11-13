#!/usr/bin/env node
// Lists every figure said twice inside one card, row or list item on the app's pages (owner rule 1, Nov 13:
// "so many numbers repeating"). A card that shows $50.77 and −1.8% must not say them again in its sentence.
//
//   node scripts/audit-number-repeats.mjs --base http://localhost:8000 [--cookie-file f] [--width 1280] [--json out.json] [paths...]
//
// Drives a headless Chrome over the DevTools protocol (CHROME_BIN, default: Playwright's Chrome for Testing). For
// each page it reads the visible text of every card-like box (li, article, tr, [class*=card]), finds the figures
// in it ($ prices, % moves, 3.1x multiples, "Nov 11" dates) and prints those that appear twice in the same box,
// innermost box only. SVG text (chart axes), aria-hidden and screen-reader-only text are skipped. A path ending in
// "/*" opens the page before it and follows its first link one level down ("/themes/*" -> the first theme).
// Two different things that happen to share a value (a price equal to its level) are listed too: worth a look.
// Exits 1 when it finds any. --cookie-file sets the tikrr_session cookie for a signed-in run (never printed).
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_PATHS = [
  "/", "/briefing", "/agent", "/inbox", "/portfolio", "/explore", "/signals", "/news", "/calendar",
  "/stock/AMD", "/stock/CBRS", "/stock/NVDA", "/themes", "/themes/*", "/baskets", "/baskets/*", "/follow",
  "/follow/*", "/insiders", "/strategies", "/backtest", "/practice", "/markets", "/screener", "/sectors",
  "/sectors/*", "/ask",
];

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const [value] = args.splice(i, 2).slice(1);
  return value;
};
const base = (opt("base", "http://localhost:8000") || "").replace(/\/$/, "");
const cookieFile = opt("cookie-file", "");
const width = Number(opt("width", "1280"));
const jsonOut = opt("json", "");
const wait = Number(opt("wait", "2500"));
const paths = args.length ? args : DEFAULT_PATHS;

// The figures a reader sees, normalised so "−1.8%" and "1.8%" (the sign is the colour) or "$1,431" and
// "$1,431.00" count as one: the prices, moves and multiples backend/mail/kit.py figures() and lib/no-repeat.ts read,
// plus what a page also shows ($4.5B with its K/M/B/T, bare decimals such as a VIX of 18.7, and "Nov 11" dates).
const AUDIT = `(() => {
  const FIG = /\\$\\s?\\d[\\d,]*(?:\\.\\d+)?(?:\\s?[KMBT]\\b)?|\\d+(?:\\.\\d+)?\\s?%|\\b\\d+(?:\\.\\d+)?x\\b|(?<![\\d.$:])\\d+\\.\\d+(?![\\d.%x])|\\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\.? \\d{1,2}\\b/g;
  const norm = (t) => {
    t = t.replace(/\\s+/g, " ").trim();
    if (t.startsWith("$")) {
      const m = /([\\d,]+(?:\\.\\d+)?)\\s?([KMBT])?/.exec(t);
      return "$" + Number(m[1].replace(/,/g, "")) + (m[2] || "");
    }
    if (t.endsWith("%")) return Number(t.replace(/[^\\d.]/g, "")) + "%";
    if (t.endsWith("x")) return Number(t.slice(0, -1)) + "x";
    if (/^[\\d.]+$/.test(t)) return "#" + Number(t);
    return t.replace(".", "");
  };
  const hidden = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      if (e.namespaceURI === "http://www.w3.org/2000/svg") return true;
      if (e.getAttribute && e.getAttribute("aria-hidden") === "true") return true;
      const cls = typeof e.className === "string" ? e.className : "";
      if (/(^|\\s)sr-only(\\s|$)|axis|tick|legend/i.test(cls)) return true;
      const st = getComputedStyle(e);
      if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") return true;
    }
    const r = el.getBoundingClientRect();
    return r.width <= 1 || r.height <= 1;
  };
  // each figure in a box, and whether it sits in a sentence (prose) or stands as a figure or label
  const occurrences = (box) => {
    const out = [];
    const parts = [];
    const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const s = n.nodeValue.trim();
      if (!s || !n.parentElement || hidden(n.parentElement)) continue;
      parts.push(s);
      const host = n.parentElement.closest("p, li, span, div, td, h1, h2, h3, h4, a") || n.parentElement;
      const words = (host.textContent.match(/[A-Za-z]{2,}/g) || []).length;
      for (const m of s.match(FIG) || []) out.push({ tok: norm(m), prose: words >= 5 });
    }
    return { occ: out, text: parts.join(" ").replace(/\\s+/g, " ") };
  };
  const describe = (el) => {
    const cls = (typeof el.className === "string" ? el.className : "").split(/\\s+/).filter(Boolean).slice(0, 3).join(".");
    return el.tagName.toLowerCase() + (cls ? "." + cls : "");
  };
  const BOX = 'li, article, tr, section, [class*="card" i], [data-card]';
  const found = [];
  for (const el of document.querySelectorAll(BOX)) {
    if (hidden(el)) continue;
    const { occ, text } = occurrences(el);
    if (!text || text.length > 5000) continue;
    // a box that holds a list is a section: two of its items may share a value, so only a figure that a sentence in
    // it says again counts there; inside one card or row any figure said twice counts
    const section = el.querySelectorAll(BOX).length >= 3 || text.length > 700;
    const counts = {};
    const inProse = {};
    for (const o of occ) {
      counts[o.tok] = (counts[o.tok] || 0) + 1;
      if (o.prose) inProse[o.tok] = true;
    }
    const twice = Object.keys(counts).filter((t) => counts[t] > 1 && (!section || inProse[t]));
    if (twice.length) found.push({ el, twice, text, kind: section ? "section" : "card" });
  }
  // innermost box only: a list item whose repeats all sit inside one of its cards is that card's repeat
  const keep = found.filter((f) => !found.some((d) => d !== f && f.el.contains(d.el) && f.twice.every((t) => d.twice.includes(t))));
  return keep.map((f) => ({ box: describe(f.el), kind: f.kind, twice: f.twice, text: f.text.slice(0, 260) }));
})()`;

const chrome =
  process.env.CHROME_BIN ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const port = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), "norep-"));
const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run",
  "--hide-scrollbars", "--disable-gpu", `--window-size=${width},900`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error("chrome did not start");
}

let code = 0;
try {
  const ws = new WebSocket(await connect());
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  let loaded = false;
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method === "Page.loadEventFired") loaded = true;
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evalJs = async (expression) =>
    (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send("Page.enable");
  await send("Runtime.enable");
  const mobile = width < 600;
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile });
  if (cookieFile) {
    const value = readFileSync(cookieFile, "utf8").trim();
    await send("Network.enable");
    await send("Network.setCookie", { name: "tikrr_session", value, domain: new URL(base).hostname, path: "/", httpOnly: true });
    // the browser's own auth has no user here and would clear the session cookie
    await send("Network.setBlockedURLs", { urls: ["*api/auth/session*"] });
  }
  const open = async (url) => {
    loaded = false;
    await send("Page.navigate", { url });
    for (let i = 0; i < 300 && !loaded; i++) await sleep(100);
    await sleep(wait);
    // walk the page so lazy sections render
    await evalJs(`(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.8) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } scrollTo(0, 0); })()`);
    await sleep(400);
  };
  const report = [];
  for (const raw of paths) {
    let path = raw;
    if (raw.endsWith("/*")) {
      const parent = raw.slice(0, -2);
      await open(base + parent);
      const prefix = `${parent}/`;
      path = await evalJs(`(() => { const a = [...document.querySelectorAll('a[href^="${prefix}"]')].map((x) => new URL(x.href).pathname).find((p) => p.split("/").length === ${prefix.split("/").length} && !/\\/(new|copy)$/.test(p)); return a || ""; })()`);
      if (!path) { report.push({ path: raw, error: "no link found" }); continue; }
    }
    await open(base + path);
    const where = await evalJs("location.pathname");
    const items = (await evalJs(AUDIT)) || [];
    report.push({ path, landed: where, items });
    console.log(`\n## ${path}${where !== path ? ` (landed on ${where})` : ""}  ${items.length} box(es) with a figure twice`);
    for (const it of items) console.log(`- [${it.twice.join(", ")}] ${it.kind} <${it.box}> ${it.text}`);
    if (items.length) code = 1;
  }
  const total = report.reduce((n, r) => n + (r.items?.length || 0), 0);
  console.log(`\n${total} box(es) with a figure said twice across ${report.length} page(s)`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  ws.close();
} finally {
  proc.kill("SIGKILL");
  rmSync(profile, { recursive: true, force: true });
}
process.exit(code);
