// Shared PostHog API access for the scripts in this folder.
//
// Needs a PostHog *personal* API key in POSTHOG_TOKEN (or POSTHOG_PERSONAL_API_KEY)
// and POSTHOG_PROJECT_ID, from the environment or .env.local. Values are never printed.
// Scopes: query:read for audit-events.mjs; dashboard:write and insight:write
// (which include read) for create-dashboard.mjs.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split("\n")
        .filter((line) => /^[A-Z0-9_]+=/.test(line))
        .map((line) => {
          const at = line.indexOf("=");
          let value = line.slice(at + 1).trim();
          if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
          return [line.slice(0, at), value];
        }),
    );
  } catch {
    return {};
  }
}

const fileEnv = readEnvFile(resolve(process.cwd(), ".env.local"));
const pick = (name) => (process.env[name] || fileEnv[name] || "").trim();

export const config = {
  token: pick("POSTHOG_PERSONAL_API_KEY") || pick("POSTHOG_TOKEN"),
  projectId: pick("POSTHOG_PROJECT_ID"),
  host: (pick("POSTHOG_API_HOST") || pick("NEXT_PUBLIC_POSTHOG_HOST") || "https://us.i.posthog.com")
    .replace("i.posthog.com", "posthog.com")
    .replace(/\/$/, ""),
};

export function requireConfig() {
  const missing = [];
  if (!config.token) missing.push("POSTHOG_TOKEN (a personal API key)");
  if (!config.projectId) missing.push("POSTHOG_PROJECT_ID");
  if (missing.length) {
    console.error(`Missing ${missing.join(" and ")}. Set them in the environment or .env.local.`);
    process.exit(2);
  }
}

export async function api(method, path, body) {
  const url = `${config.host}${path.replace("{project}", config.projectId)}`;
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if (!response.ok) {
    const detail = json?.detail || json?.raw || response.statusText;
    const error = new Error(`${method} ${path} -> ${response.status}: ${detail}`);
    error.status = response.status;
    error.body = json;
    throw error;
  }
  return json;
}

export async function hogql(query) {
  const result = await api("POST", "/api/projects/{project}/query/", { query: { kind: "HogQLQuery", query } });
  const columns = result?.columns ?? [];
  return (result?.results ?? []).map((row) => Object.fromEntries(columns.map((column, i) => [column, row[i]])));
}

/** Every page of a paginated list endpoint. */
export async function listAll(path) {
  const out = [];
  let next = path;
  while (next) {
    const page = await api("GET", next);
    out.push(...(page?.results ?? []));
    next = page?.next ? page.next.replace(config.host, "") : null;
  }
  return out;
}

/** Only stocksbrew traffic (the PostHog project is shared with other sites), never dev or preview events. */
export const HOSTS = ["www.stocksbrew.online", "stocksbrew.online"];
export const SITE_SQL = `properties.$host IN (${HOSTS.map((h) => `'${h}'`).join(", ")}) AND coalesce(toString(properties.$environment), '') != 'dev'`;
