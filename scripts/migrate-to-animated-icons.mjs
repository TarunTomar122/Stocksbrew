#!/usr/bin/env node
/**
 * Safe single-line migration: material-symbols-outlined → AnimatedIcon.
 */
import fs from "node:fs";
import path from "node:path";

const roots = ["components", "app"];
const importLine = 'import { AnimatedIcon } from "@/components/animated-icon";';

function extractSize(attrs, fallback = 18) {
  const fontSize = attrs.match(/fontSize:\s*(\d+)/);
  if (fontSize) return Number(fontSize[1]);
  const textPx = attrs.match(/text-\[(\d+)px\]/);
  if (textPx) return Number(textPx[1]);
  if (attrs.includes("text-base")) return 16;
  return fallback;
}

function extractClassName(attrs) {
  const match = attrs.match(/className="([^"]*)"/);
  if (!match) return "";
  return match[1].replace(/\bmaterial-symbols-outlined\b/g, "").replace(/\s+/g, " ").trim();
}

function addImport(content) {
  if (content.includes(importLine)) return content;
  if (content.startsWith('"use client"')) {
    return content.replace('"use client";\n', `"use client";\n\n${importLine}\n`);
  }
  const firstImportEnd = content.indexOf("\n", content.indexOf("import "));
  if (firstImportEnd === -1) return `${importLine}\n${content}`;
  return content.slice(0, firstImportEnd + 1) + importLine + "\n" + content.slice(firstImportEnd + 1);
}

function migrateContent(content) {
  let changed = false;

  content = content.replace(
    /<span([^>\n]*className="[^"]*material-symbols-outlined[^"]*"[^>]*)>\s*([a-z0-9_]+)\s*<\/span>/gi,
    (_full, attrs, iconName) => {
      changed = true;
      const size = extractSize(attrs);
      const className = extractClassName(attrs);
      const classProp = className ? ` className="${className}"` : "";
      const aria = /aria-hidden/.test(attrs) ? " aria-hidden" : "";
      return `<AnimatedIcon name="${iconName}" size={${size}}${classProp}${aria} />`;
    },
  );

  content = content.replace(
    /<span([^>\n]*className="[^"]*material-symbols-outlined[^"]*"[^>]*)>\s*\{([a-zA-Z_][a-zA-Z0-9_]*)\}\s*<\/span>/g,
    (_full, attrs, varName) => {
      changed = true;
      const size = extractSize(attrs);
      const className = extractClassName(attrs);
      const classProp = className ? ` className="${className}"` : "";
      return `<AnimatedIcon name={${varName}} size={${size}}${classProp} aria-hidden />`;
    },
  );

  content = content.replace(
    /<span([\s\S]{0,220}?className="[^"]*material-symbols-outlined[^"]*"[\s\S]{0,120}?)>\s*([a-z0-9_]+|\{[^}]+\})\s*<\/span>/gi,
    (_full, attrs, iconRef) => {
      changed = true;
      const size = extractSize(attrs);
      const className = extractClassName(attrs);
      const classProp = className ? ` className="${className}"` : "";
      const aria = /aria-hidden/.test(attrs) ? " aria-hidden" : "";
      const nameProp = iconRef.startsWith("{") ? `name=${iconRef}` : `name="${iconRef}"`;
      return `<AnimatedIcon ${nameProp} size={${size}}${classProp}${aria} />`;
    },
  );

  if (!changed) return { content, changed: false };
  return { content: addImport(content), changed: true };
}

let filesChanged = 0;
for (const root of roots) {
  for (const file of fs.readdirSync(root, { recursive: true })) {
    if (typeof file !== "string" || !file.endsWith(".tsx")) continue;
    const full = path.join(root, file);
    const before = fs.readFileSync(full, "utf8");
    if (!before.includes("material-symbols-outlined")) continue;
    const { content, changed } = migrateContent(before);
    if (changed) {
      fs.writeFileSync(full, content);
      filesChanged += 1;
      console.log("migrated", full);
    }
  }
}
console.log("done", filesChanged);
