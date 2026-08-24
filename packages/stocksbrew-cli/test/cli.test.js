import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = new URL("../bin/stocksbrew.js", import.meta.url);

test("prints agent-friendly help", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(cli), "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /stocksbrew market/);
});

test("reports invalid commands as JSON", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(cli), "unknown"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr).error.code, "invalid_cli_request");
});

test("accepts global options before the command", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(cli), "--base-url", "http://localhost:1", "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
});
