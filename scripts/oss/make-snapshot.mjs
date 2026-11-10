#!/usr/bin/env node
// Build a clean, fresh-history public snapshot of this repo in a NEW folder.
//
// It never touches this repository: it copies files out, drops everything in
// scripts/oss/exclude.txt, applies generic redactions (no private literal is
// stored in this script), runs `git init` + `git add -A` in the new folder (no
// commit, no remote, no push) and re-runs scripts/oss/scan.mjs there.
//
// Usage:
//   node scripts/oss/make-snapshot.mjs --out ../stocksbrew-public            # from HEAD
//   node scripts/oss/make-snapshot.mjs --out ../stocksbrew-public --ref main
//   node scripts/oss/make-snapshot.mjs --out ../stocksbrew-public --worktree # uncommitted files too
//
// Review the output folder, then commit and push it yourself (steps in
// docs/open-source/readiness.md).

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const outArg = opt("--out", null);
const ref = opt("--ref", "HEAD");
const fromWorktree = args.includes("--worktree");
if (!outArg) {
  console.error("usage: make-snapshot.mjs --out <new folder> [--ref <ref> | --worktree]");
  process.exit(2);
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const out = path.resolve(outArg);
if (out === root || out.startsWith(root + path.sep)) {
  console.error("--out must be outside this repository");
  process.exit(2);
}
if (existsSync(out) && readdirSync(out).length) {
  console.error(`${out} exists and is not empty; pick a new folder`);
  process.exit(2);
}
mkdirSync(out, { recursive: true });

// 1. copy files out
if (fromWorktree) {
  const list = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, maxBuffer: 1 << 28 })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  for (const rel of list) {
    const src = path.join(root, rel);
    if (!existsSync(src) || !statSync(src).isFile()) continue;
    mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    copyFileSync(src, path.join(out, rel));
  }
} else {
  const tar = execFileSync("git", ["archive", "--format=tar", ref], { cwd: root, maxBuffer: 1 << 30 });
  execFileSync("tar", ["-x", "-C", out], { input: tar });
}

// 2. drop excluded paths
const excludes = readFileSync(path.join(root, "scripts/oss/exclude.txt"), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));
let removed = 0;
for (const rel of excludes) {
  const target = path.join(out, rel);
  if (!target.startsWith(out + path.sep)) continue;
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    removed++;
  }
}

// 3. generic redactions (patterns only, no private values)
const PUBLIC_EMAIL = "tomartarun2001@gmail.com";
const REDACTIONS = [
  // public IPv4 addresses in docs/config/scripts (not user-agent version strings)
  {
    re: /\b(?!(?:10|127|0)\.)(?!192\.168\.)(?!172\.(?:1[6-9]|2\d|3[01])\.)(?:\d{1,3}\.){3}\d{1,3}\b/g,
    to: (m, line) => (m.endsWith(".0.0.0") || line.includes(`/${m}`) || m.split(".").every((n) => Number(n) < 10) ? m : "<vps-ip>"),
    only: /\.(md|sh|service|timer|py|mjs|js|ts|txt)$|(^|\/)Caddyfile$|(^|\/)[a-z0-9-]+$/,
  },
  { re: /\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/g, to: () => "<tailscale-ip>" },
  { re: /\b[a-z0-9-]+\.vps\.ovh\.[a-z]+\b/gi, to: () => "<vps-hostname>" },
  { re: /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.ts\.net\b/gi, to: () => "<tailnet-host>" },
  { re: /\byourtraceonline-[a-z0-9]+s-projects\b/g, to: () => "<vercel-team>" },
  { re: /\/Users\/[A-Za-z0-9._-]+\/Documents\/personal\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\//g, to: () => "./" },
  { re: /\/Users\/[A-Za-z0-9._-]+\/[^\s"'`)]*/g, to: () => "<local-path>" },
  {
    // private addresses in code and docs; the chosen public contact stays
    re: /\b[A-Za-z0-9._%+-]+@(?:gmail\.com|adobe\.com|tikrr\.(?:com|online))\b/g,
    to: (m) => (m.toLowerCase() === PUBLIC_EMAIL ? m : "you@example.com"),
  },
  // Discord snowflakes next to a discord/channel/guild word
  { re: /\b\d{17,20}\b/g, to: (m, line) => (/discord|channel|guild|user_?id/i.test(line) ? "<discord-id>" : m) },
];

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (st.isFile()) acc.push(p);
  }
  return acc;
}

const changed = [];
for (const file of walk(out)) {
  const rel = path.relative(out, file);
  if (rel.startsWith("scripts/oss/")) continue; // keep the scanner's patterns intact
  if (/package-lock\.json$/.test(rel)) continue;
  const buf = readFileSync(file);
  if (buf.subarray(0, 8000).includes(0) || buf.length > 3 * 1024 * 1024) continue;
  const text = buf.toString("utf8");
  let hits = 0;
  const next = text
    .split("\n")
    .map((line) => {
      let l = line;
      for (const r of REDACTIONS) {
        if (r.only && !r.only.test(rel)) continue;
        l = l.replace(r.re, (m) => {
          const v = r.to(m, line);
          if (v !== m) hits++;
          return v;
        });
      }
      return l;
    })
    .join("\n");
  if (hits) {
    writeFileSync(file, next);
    changed.push(`${rel} (${hits})`);
  }
}

// 4. stage in a fresh repo (no commit) and rescan
execFileSync("git", ["init", "-q", "-b", "main"], { cwd: out });
execFileSync("git", ["add", "-A"], { cwd: out });
console.log(`snapshot: ${out}`);
console.log(`source: ${fromWorktree ? "working tree" : ref}; excluded paths removed: ${removed}`);
console.log(`redacted files: ${changed.length}`);
for (const c of changed) console.log(`  ${c}`);
console.log("\nrescan of the snapshot (tree only):\n");
try {
  const report = execFileSync("node", [path.join(out, "scripts/oss/scan.mjs"), "--tree"], { cwd: out, encoding: "utf8", maxBuffer: 1 << 28 });
  console.log(report);
} catch (e) {
  // scan exits 1 when secrets remain; show its report anyway
  console.log(e.stdout || String(e));
  process.exitCode = 1;
}
console.log("Nothing was committed or pushed. Review the folder, then follow docs/open-source/readiness.md.");
