// Next 13.5 ships @vercel/og with resvg-wasm 2.4.1, whose render() never frees the Resvg instance or the rendered
// image: every ImageResponse (share images, /api/og) left ~3.3 MB in WebAssembly memory, which never shrinks, so each
// web instance grew ~180 MB/h until its cgroup OOM-killed it (Nov 14-15). Newer @vercel/og (0.11) frees both; this
// adds the same two calls to Next's copy. deploy-web.sh runs it before `next build` (npm ci runs with
// --ignore-scripts, so a postinstall would not) and checks the standalone output after. Idempotent; it fails loudly if
// the code is in neither known form (after a Next upgrade: check whether it still leaks, then drop this).
//   node scripts/patch-next-og.mjs [root]            patch root/node_modules (default: .)
//   node scripts/patch-next-og.mjs --check [root]    exit 1 unless root's copy is patched
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BUNDLE = "node_modules/next/dist/compiled/@vercel/og/index.node.js";
export const LEAKY = "  return resvgJS.render().asPng();\n";
export const FIXED =
  "  const pngData = resvgJS.render();\n  const pngBuffer = pngData.asPng();\n  pngData.free();\n  resvgJS.free();\n  return pngBuffer;\n";

export function freeResvg(source) {
  if (source.includes(FIXED)) return source;
  if (source.split(LEAKY).length !== 2) throw new Error(`${BUNDLE}: resvg render() not in a known form; check the leak by hand`);
  return source.replace(LEAKY, FIXED);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv[2] === "--check";
  const file = path.join(process.argv[check ? 3 : 2] ?? ".", BUNDLE);
  const source = fs.readFileSync(file, "utf8");
  if (check) {
    if (!source.includes(FIXED)) {
      console.error(`${file}: resvg is not freed (OG images leak memory)`);
      process.exit(1);
    }
    console.log(`ok: ${file} frees resvg`);
  } else {
    const fixed = freeResvg(source);
    if (fixed !== source) {
      fs.writeFileSync(file, fixed);
      console.log(`patched ${file}`);
    }
  }
}
