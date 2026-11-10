#!/usr/bin/env node
// Open-source readiness scan: secrets, PII and private infrastructure.
//
// Scans (a) the working tree (tracked + untracked files that are not
// gitignored) and (b) every blob reachable from a ref (default origin/main),
// plus commit author/committer metadata. Findings are printed MASKED: the
// scanner never prints a matched value or the line it was found on. Each value
// gets a short sha256 fingerprint so the same secret can be correlated across
// files and commits without revealing it.
//
// Usage:
//   node scripts/oss/scan.mjs                  # tree + history of origin/main
//   node scripts/oss/scan.mjs --tree           # working tree only
//   node scripts/oss/scan.mjs --history        # history only
//   node scripts/oss/scan.mjs --ref main       # pick the ref to walk
//   node scripts/oss/scan.mjs --json out.json  # also write masked JSON
//   node scripts/oss/scan.mjs --only secret    # filter by category (secret|pii|infra)
//   node scripts/oss/scan.mjs --allow-email you@example.com  # extra public email
//
// Exit code: 1 if any "secret" category finding exists, else 0.
// No dependencies. Needs git on PATH. Run from anywhere inside the repo.

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const optAll = (name) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));

const wantTree = flag("--tree") || !flag("--history");
const wantHistory = flag("--history") || !flag("--tree");
const ref = opt("--ref", "origin/main");
const jsonOut = opt("--json", null);
const onlyCategory = opt("--only", null);
const MAX_BYTES = 3 * 1024 * 1024;

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

// Reviewed false positives, keyed by fingerprint. See scripts/oss/allowlist.json.
let ALLOWLIST = {};
try {
  ALLOWLIST = JSON.parse(readFileSync(path.join(root, "scripts/oss/allowlist.json"), "utf8")).fingerprints || {};
} catch {
  ALLOWLIST = {};
}

// Emails that are fine to publish. The owner picked one public contact; the
// rest are generic/system addresses. Add more with --allow-email.
const ALLOWED_EMAILS = new Set(
  [
    "tomartarun2001@gmail.com",
    "noreply@anthropic.com",
    "noreply@github.com",
    "git@github.com",
    ...optAll("--allow-email"),
  ].map((e) => e.toLowerCase()),
);
const ALLOWED_EMAIL_DOMAINS = [
  "example.com", "example.org", "example.net", "test.com", "test.local", "localhost",
  "users.noreply.github.com", "sentry.io", "email.com", "domain.com", "yourdomain.com",
  "stocksbrew.test", "mail.test", "acme.com", "acme.test", "client.example", "example",
];
// Placeholder-looking values that should not count as secrets.
const PLACEHOLDER = /^(x+|\*+|<.*>|\$\{.*\}|your[_-]?|changeme|placeholder|redacted|dummy|test|fake|example|sample|secret|token|xxx|\.\.\.|process\.env|os\.environ|undefined|null|none|true|false)/i;

// Files where hashes/ids are expected and noisy for the generic rules.
const NOISY_FILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|.*\.min\.js|.*\.map)$/;

/** @type {{id:string, category:'secret'|'pii'|'infra', type:string, re:RegExp, group?:number, check?:(v:string,line:string,file:string)=>boolean, noisyOk?:boolean}[]} */
const RULES = [
  // ---- secrets ---------------------------------------------------------
  { id: "private-key", category: "secret", type: "PEM private key", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g },
  { id: "gcp-service-account", category: "secret", type: "Google service-account JSON", re: /"private_key_id"\s*:\s*"([0-9a-f]{40})"/g, group: 1 },
  { id: "google-api-key", category: "secret", type: "Google/Firebase API key (AIza)", re: /AIza[0-9A-Za-z_-]{35}/g },
  { id: "anthropic-key", category: "secret", type: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { id: "openai-key", category: "secret", type: "OpenAI API key", re: /\bsk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g },
  { id: "github-token", category: "secret", type: "GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})/g },
  { id: "slack-token", category: "secret", type: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { id: "stripe-key", category: "secret", type: "Stripe key", re: /\b(?:sk|rk|pk)_(?:live|test)_[0-9A-Za-z]{16,}/g },
  { id: "resend-key", category: "secret", type: "Resend API key", re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/g },
  { id: "webhook-secret", category: "secret", type: "Webhook signing secret (whsec_)", re: /\bwhsec_[A-Za-z0-9+/=]{20,}/g },
  { id: "aws-key", category: "secret", type: "AWS access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: "brevo-key", category: "secret", type: "Brevo (Sendinblue) API key", re: /\bxkeysib-[A-Za-z0-9-]{40,}/g },
  { id: "firecrawl-key", category: "secret", type: "Firecrawl API key", re: /\bfc-[0-9a-f]{32}\b/g },
  { id: "openrouter-key", category: "secret", type: "OpenRouter API key", re: /\bsk-or-v1-[0-9a-f]{40,}/g },
  { id: "tavily-key", category: "secret", type: "Tavily API key", re: /\btvly-[A-Za-z0-9-]{20,}/g },
  { id: "tailscale-key", category: "secret", type: "Tailscale auth key", re: /\btskey-[A-Za-z0-9-]{20,}/g },
  { id: "posthog-key", category: "secret", type: "PostHog project key (public by design, still review)", re: /\bph[cx]_[A-Za-z0-9]{30,}/g },
  { id: "telegram-bot", category: "secret", type: "Telegram bot token", re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g },
  { id: "discord-webhook", category: "secret", type: "Discord webhook URL", re: /discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g },
  { id: "discord-bot-token", category: "secret", type: "Discord bot token", re: /\b[MN][A-Za-z0-9_-]{23,25}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}\b/g },
  { id: "jwt", category: "secret", type: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { id: "bearer-literal", category: "secret", type: "Hard-coded bearer token", re: /\bBearer\s+([A-Za-z0-9_\-.=~+/]{24,})/g, group: 1, check: (v) => !PLACEHOLDER.test(v) && entropy(v) > 3.5 },
  {
    id: "env-assignment",
    category: "secret",
    type: "Credential-looking env assignment",
    // NAME=value / NAME: "value" where NAME looks like a credential.
    re: /(?<![A-Za-z0-9])(_*[A-Z][A-Z0-9_]*(?:API_KEY|APIKEY|_KEY|SECRET|TOKEN|PASSWORD|PASSWD|_PASS|PRIVATE_KEY|CREDENTIALS?|AUTH))\s*[:=]\s*["']?([A-Za-z0-9_\-.+/=~:]{16,})["']?/g,
    group: 2,
    check: (v) =>
      !PLACEHOLDER.test(v) &&
      !/^(process|os|env|config|settings|import)\b/.test(v) &&
      !v.startsWith("/") && // file paths such as /etc/.../credentials.json
      !/^[A-Za-z_$][\w$]*\.[A-Za-z_$]/.test(v) && // member access: envLocal.FOO
      !/^[a-z0-9]+(?:[-_:.][a-z0-9]+)+$/.test(v) && // lowercase slugs: storage keys, labels
      /\d/.test(v) && /[A-Za-z]/.test(v) &&
      entropy(v) > 3.3,
  },
  {
    id: "generic-secret",
    category: "secret",
    type: "Generic secret literal",
    re: /(?:api[_-]?key|apikey|secret|token|password|passwd|auth[_-]?token|access[_-]?token|client[_-]?secret)["']?\s*[:=]\s*["']([A-Za-z0-9_\-.+/=~]{16,})["']/gi,
    group: 1,
    check: (v) => !PLACEHOLDER.test(v) && /\d/.test(v) && /[A-Za-z]/.test(v) && !/^[a-z0-9]+(?:[-_:.][a-z0-9]+)+$/.test(v) && entropy(v) > 3.4,
  },
  // ---- PII --------------------------------------------------------------
  {
    id: "email",
    category: "pii",
    type: "Email address",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g,
    check: (v, line, file) => {
      const e = v.toLowerCase();
      if (ALLOWED_EMAILS.has(e)) return false;
      const domain = e.split("@")[1];
      if (ALLOWED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) return false;
      if (/\.(png|jpe?g|svg|webp|gif|css|js|ts|tsx)$/.test(e)) return false; // asset@2x.png etc.
      if (/^[0-9a-f]{8,}@/.test(e)) return false; // npm integrity / sha artifacts
      return true;
    },
    noisyOk: false,
  },
  { id: "phone", category: "pii", type: "Phone number", re: /(?:tel:|\+)(?:1|44|91|61|49|33)[\s-]?\(?\d{2,5}\)?[\s-]?\d{3,5}[\s-]?\d{3,5}\b/g },
  {
    id: "discord-id",
    category: "pii",
    type: "Discord user/channel ID",
    re: /\b\d{17,20}\b/g,
    check: (_v, line) => /discord|channel|guild|user_?id|mention|<@/i.test(line),
  },
  {
    id: "public-ipv4",
    category: "pii",
    type: "Public IPv4 address",
    re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    check: (v, line) =>
      isPublicIp(v) &&
      !v.endsWith(".0.0.0") && // Chrome/120.0.0.0 style user agents
      !line.includes(`/${v}`) &&
      !/version|"v?\d+\.\d+\.\d+\.\d+"|semver|integrity/i.test(line),
  },
  // ---- private infrastructure ------------------------------------------
  { id: "tailscale-host", category: "infra", type: "Tailscale MagicDNS / Funnel hostname", re: /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.ts\.net\b/gi },
  { id: "vps-hostname", category: "infra", type: "VPS provider hostname", re: /\b(?:vps|ns)\d*-[0-9a-f]{6,}(?:\.vps)?\.ovh\.(?:ca|net|com)\b/gi },
  { id: "localdb-host", category: "infra", type: "LocalDB public hostname", re: /\bdb\.stocksbrew\.online\b/g },
  { id: "vercel-id", category: "infra", type: "Vercel team/project/org id", re: /\b(?:team_[A-Za-z0-9]{20,}|prj_[A-Za-z0-9]{20,})\b/g },
  { id: "vercel-team-slug", category: "infra", type: "Vercel team slug", re: /\byourtraceonline-[a-z0-9]+s-projects\b/g },
  { id: "personal-path", category: "infra", type: "Personal filesystem path (/Users/<name>, /home/<name>)", re: /\/(?:Users|home)\/(?!ubuntu\b|runner\b|user\b|me\b)[A-Za-z0-9._-]+\/[^\s"'`)},;]*/g },
  { id: "server-path", category: "infra", type: "Server path (/opt/tikrr, /etc/tikrr, /srv/tikrr-data)", re: /\/(?:opt\/tikrr|etc\/tikrr|srv\/tikrr-data|var\/lib\/tikrr)\b[^\s"'`)},;]*/g },
  { id: "ssh-target", category: "infra", type: "SSH user@host target", re: /\b(?:ubuntu|root|debian)@(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { id: "firebase-project", category: "infra", type: "Firebase project id", re: /\btrace-money-\d{4,}\b/g },
];

function entropy(s) {
  const counts = {};
  for (const c of s) counts[c] = (counts[c] || 0) + 1;
  let h = 0;
  for (const k in counts) {
    const p = counts[k] / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function isPublicIp(ip) {
  const o = ip.split(".").map(Number);
  if (o.some((n) => n > 255)) return false;
  const [a, b] = o;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT / Tailscale
  if (ip === "1.1.1.1" || ip === "8.8.8.8" || ip === "8.8.4.4") return false;
  if (o.every((n) => n < 10)) return false; // 1.2.3.4-ish version strings
  return true;
}

function fingerprint(v) {
  return createHash("sha256").update(v).digest("hex").slice(0, 10);
}

function mask(rule, v) {
  if (rule.id === "ssh-target") return v.replace(/@(\d+)\.\d+\.\d+\.(\d+)/, "@$1.***.***.$2");
  if (rule.id === "tailscale-host" || rule.id === "vps-hostname") return v.replace(/[0-9a-f]{6,}|tail[0-9a-f]+/gi, "******");
  if (rule.category === "infra" && rule.id !== "vercel-id") return v; // paths/public names are not secret; show them
  if (rule.id === "email") {
    const [local, domain] = v.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  }
  if (rule.id === "public-ipv4") {
    const o = v.split(".");
    return `${o[0]}.***.***.${o[3]}`;
  }
  if (rule.id === "private-key") return "-----BEGIN … PRIVATE KEY-----";
  const keep = Math.min(4, Math.floor(v.length / 6));
  return `${v.slice(0, keep)}${"*".repeat(6)} (len ${v.length})`;
}

function isBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/** findings keyed by rule + fingerprint */
const findings = new Map();
const skipped = [];

function record(rule, value, where) {
  const fp = fingerprint(value);
  const key = `${rule.id}:${fp}`;
  let f = findings.get(key);
  if (!f) {
    f = { rule: rule.id, category: rule.category, type: rule.type, masked: mask(rule, value), fingerprint: fp, tree: [], history: [] };
    findings.set(key, f);
  }
  const list = where.kind === "tree" ? f.tree : f.history;
  const label = where.kind === "tree" ? `${where.file}:${where.line}` : `${where.file}:${where.line} @${where.commit || "?"}`;
  if (!list.includes(label)) list.push(label);
}

function scanText(text, file, where) {
  const noisy = NOISY_FILE.test(file);
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 20000) continue; // minified blobs
    for (const rule of RULES) {
      if (noisy && rule.noisyOk !== true && rule.category !== "secret") continue;
      if (noisy && (rule.id === "generic-secret" || rule.id === "env-assignment")) continue;
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line))) {
        const value = rule.group ? m[rule.group] : m[0];
        if (!value) continue;
        if (rule.check && !rule.check(value, line, file)) continue;
        record(rule, value, { ...where, file, line: i + 1 });
      }
    }
  }
}

function scanTree() {
  const out = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, maxBuffer: 1 << 28 });
  const files = out.toString("utf8").split("\0").filter(Boolean);
  for (const file of files) {
    if (file.startsWith("scripts/oss/")) continue; // the scanner's own patterns
    const abs = path.join(root, file);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue; // deleted in the working tree
    }
    if (!st.isFile()) continue;
    if (st.size > MAX_BYTES) {
      skipped.push(`${file} (${(st.size / 1e6).toFixed(1)} MB, tree)`);
      continue;
    }
    const buf = readFileSync(abs);
    if (isBinary(buf)) continue;
    scanText(buf.toString("utf8"), file, { kind: "tree" });
  }
  return files.length;
}

/** blob sha -> first commit (oldest) that introduced it on `ref` */
function blobIntroductions() {
  const out = execFileSync("git", ["log", ref, "--reverse", "--raw", "--no-abbrev", "--no-renames", "--format=@@%H"], { cwd: root, maxBuffer: 1 << 30 }).toString("utf8");
  const map = new Map();
  let commit = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("@@")) commit = line.slice(2, 10);
    else if (line.startsWith(":")) {
      const parts = line.split(/\s+/);
      const sha = parts[3];
      if (sha && !/^0+$/.test(sha) && !map.has(sha)) map.set(sha, commit);
    }
  }
  return map;
}

async function scanHistory() {
  const list = execFileSync("git", ["rev-list", "--objects", ref], { cwd: root, maxBuffer: 1 << 28 }).toString("utf8");
  const paths = new Map();
  for (const line of list.split("\n")) {
    const sp = line.indexOf(" ");
    if (sp > 0) paths.set(line.slice(0, sp), line.slice(sp + 1));
  }
  const intro = blobIntroductions();
  const shas = [...paths.keys()];
  // Ask cat-file for everything; non-blobs are skipped while parsing.
  const proc = spawn("git", ["cat-file", "--batch"], { cwd: root });
  let buf = Buffer.alloc(0);
  let blobs = 0;
  const done = new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.stdout.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        const nl = buf.indexOf(10);
        if (nl < 0) break;
        const header = buf.subarray(0, nl).toString("utf8").split(" ");
        if (header[1] === "missing") {
          buf = buf.subarray(nl + 1);
          continue;
        }
        const size = Number(header[2]);
        if (buf.length < nl + 1 + size + 1) break;
        const body = buf.subarray(nl + 1, nl + 1 + size);
        buf = buf.subarray(nl + 1 + size + 1);
        if (header[1] !== "blob") continue;
        const sha = header[0];
        const file = paths.get(sha) || "?";
        blobs++;
        if (size > MAX_BYTES) {
          skipped.push(`${file} (${(size / 1e6).toFixed(1)} MB, history blob ${sha.slice(0, 8)})`);
          continue;
        }
        if (isBinary(body)) continue;
        scanText(body.toString("utf8"), file, { kind: "history", commit: intro.get(sha) });
      }
    });
    proc.on("close", resolve);
  });
  proc.stdin.end(shas.join("\n") + "\n");
  await done;
  return blobs;
}

function scanCommitMetadata() {
  const out = execFileSync("git", ["log", ref, "--format=%h%x09%ae%x09%ce"], { cwd: root, maxBuffer: 1 << 28 }).toString("utf8");
  const emailRule = RULES.find((r) => r.id === "email");
  const hostRule = RULES.find((r) => r.id === "vps-hostname");
  const counts = new Map();
  for (const line of out.split("\n").filter(Boolean)) {
    const [h, ae, ce] = line.split("\t");
    for (const e of new Set([ae, ce])) {
      if (!e) continue;
      const key = e.toLowerCase();
      const c = counts.get(key) || { n: 0, first: h };
      c.n++;
      c.first = h; // log is newest-first, so the last seen is the oldest
      counts.set(key, c);
    }
  }
  for (const [e, c] of counts) {
    if (!emailRule.check(e, "", "")) continue;
    hostRule.re.lastIndex = 0;
    const rule = hostRule.re.test(e) ? { ...emailRule, type: "Commit identity (VPS hostname in email)" } : { ...emailRule, type: "Commit author/committer email" };
    record(rule, e, { kind: "history", file: "<commit metadata>", line: c.n, commit: c.first });
  }
}

const started = Date.now();
let treeFiles = 0;
let historyBlobs = 0;
if (wantTree) treeFiles = scanTree();
if (wantHistory) {
  historyBlobs = await scanHistory();
  scanCommitMetadata();
}

const allowlisted = [...findings.values()].filter((f) => ALLOWLIST[f.fingerprint]);
let rows = [...findings.values()].filter((f) => !ALLOWLIST[f.fingerprint]);
if (onlyCategory) rows = rows.filter((f) => f.category === onlyCategory);
for (const f of rows) {
  f.where = f.tree.length && f.history.length ? "both" : f.tree.length ? "tree-only" : "history-only";
  if (!wantTree || !wantHistory) f.where = wantTree ? "tree" : "history";
}
const order = { secret: 0, pii: 1, infra: 2 };
rows.sort((a, b) => order[a.category] - order[b.category] || a.rule.localeCompare(b.rule) || a.masked.localeCompare(b.masked));

const summary = {};
for (const f of rows) {
  const k = `${f.category}/${f.rule}`;
  summary[k] ??= { distinct: 0, both: 0, "tree-only": 0, "history-only": 0, tree: 0, history: 0 };
  summary[k].distinct++;
  summary[k][f.where]++;
}

console.log(`# OSS scan  ref=${ref}  tree files=${treeFiles}  history blobs=${historyBlobs}  ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log("# values are masked; fp = sha256 fingerprint prefix of the raw value\n");
console.log("## summary (distinct values)");
for (const [k, v] of Object.entries(summary)) {
  const parts = Object.entries(v).filter(([kk, n]) => kk !== "distinct" && n).map(([kk, n]) => `${kk}=${n}`);
  console.log(`  ${k.padEnd(34)} ${String(v.distinct).padStart(4)}   ${parts.join(" ")}`);
}
const LIMIT = 8;
for (const cat of ["secret", "pii", "infra"]) {
  const group = rows.filter((f) => f.category === cat);
  if (!group.length) continue;
  console.log(`\n## ${cat}`);
  for (const f of group) {
    console.log(`- [${f.where}] ${f.type}: ${f.masked}  fp=${f.fingerprint}`);
    if (f.tree.length) console.log(`    tree:    ${f.tree.slice(0, LIMIT).join(", ")}${f.tree.length > LIMIT ? ` (+${f.tree.length - LIMIT} more)` : ""}`);
    if (f.history.length) console.log(`    history: ${f.history.slice(0, LIMIT).join(", ")}${f.history.length > LIMIT ? ` (+${f.history.length - LIMIT} more)` : ""}`);
  }
}
if (allowlisted.length) {
  console.log(`\n## allowlisted (scripts/oss/allowlist.json)`);
  for (const f of allowlisted) console.log(`- ${f.type}: ${f.masked}  fp=${f.fingerprint}  (${ALLOWLIST[f.fingerprint]})`);
}
if (skipped.length) {
  console.log(`\n## skipped (larger than ${MAX_BYTES / 1e6} MB, review by hand)`);
  for (const s of [...new Set(skipped)]) console.log(`- ${s}`);
}
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ ref, treeFiles, historyBlobs, summary, findings: rows, skipped: [...new Set(skipped)] }, null, 2));
  console.log(`\nwrote ${jsonOut}`);
}
process.exitCode = rows.some((f) => f.category === "secret") ? 1 : 0;
