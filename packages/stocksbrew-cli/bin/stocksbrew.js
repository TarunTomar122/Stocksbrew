#!/usr/bin/env node

const HELP = `Stocksbrew CLI

Usage:
  stocksbrew market [--market US]
  stocksbrew explore [--market US]
  stocksbrew stock <SYMBOL>
  stocksbrew search <QUERY> [--market US]
  stocksbrew openapi

Options:
  --base-url URL  Stocksbrew URL (default: https://www.stocksbrew.online)
  --token TOKEN   Personal Stocksbrew API token (or STOCKSBREW_TOKEN)
  --help          Show this help
`;

function option(args, name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] || fallback;
}

function positional(args) {
  const values = [];
  const valueOptions = new Set(["--base-url", "--token", "--market"]);
  for (let index = 0; index < args.length; index += 1) {
    if (valueOptions.has(args[index])) index += 1;
    else if (!args[index].startsWith("--")) values.push(args[index]);
  }
  return values;
}

function fail(message, code = "invalid_cli_request") {
  console.error(JSON.stringify({ error: { code, message } }));
  process.exitCode = 2;
}

async function request(path, args) {
  const baseUrl = option(args, "--base-url", process.env.STOCKSBREW_URL || "https://www.stocksbrew.online").replace(/\/$/, "");
  const token = option(args, "--token", process.env.STOCKSBREW_TOKEN);
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, { headers });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: { code: "invalid_server_response", message: text.slice(0, 200) } };
  }
  if (!response.ok) {
    const error = body.error || body;
    throw new Error(`${error.code || "request_failed"}: ${error.message || "Stocksbrew request failed."}`);
  }
  return body;
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes("--help") || args.length === 0) {
    console.log(HELP);
    return;
  }

  const [command, value] = positional(args);
  const market = encodeURIComponent(option(args, "--market", "US"));
  let path;
  if (command === "market") path = `/api/v1/market?market=${market}`;
  else if (command === "explore") path = `/api/v1/explore?market=${market}`;
  else if (command === "stock" && value) path = `/api/v1/stocks/${encodeURIComponent(value)}`;
  else if (command === "search" && value) path = `/api/v1/stocks/search?q=${encodeURIComponent(value)}&market=${market}`;
  else if (command === "openapi") path = "/api/v1/openapi.json";
  else return fail(`Unknown command or missing argument: ${command}`);

  try {
    console.log(JSON.stringify(await request(path, args), null, 2));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Stocksbrew request failed.", "request_failed");
  }
}

main();
