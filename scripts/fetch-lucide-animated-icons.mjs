#!/usr/bin/env node
/**
 * Fetch lucide-animated icon components into components/icons/.
 * Usage: node scripts/fetch-lucide-animated-icons.mjs trending-up search plus
 */
import fs from "node:fs";
import path from "node:path";

const outDir = path.join(process.cwd(), "components/icons");
const names = process.argv.slice(2);
if (!names.length) {
  console.error("Pass icon kebab names, e.g. trending-up search plus");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

for (const name of names) {
  const url = `https://lucide-animated.com/r/${name}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAIL ${name}: ${res.status}`);
    continue;
  }
  const payload = await res.json();
  const file = payload.files?.[0];
  if (!file?.content) {
    console.error(`FAIL ${name}: no file content`);
    continue;
  }
  const dest = path.join(outDir, file.path || `${name}.tsx`);
  fs.writeFileSync(dest, file.content);
  console.log(`OK ${name} -> ${path.relative(process.cwd(), dest)}`);
}
