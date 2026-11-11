import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { AskUIMessage } from "@/lib/ask-cards";
import {
  ASK_EXAMPLE_RETRY_MS,
  ASK_EXAMPLE_STALE_MS,
  MARKET_EXAMPLE_QUESTION,
  capDocId,
  exampleDay,
  exampleDocId,
  exampleQuestion,
  formatExampleSubject,
  getAskExample,
  memoryAskExampleStore,
  pageExampleSubject,
  parseExampleSubject,
  type AskExampleSubject,
} from "@/lib/ask-examples";

/**
 * Example answers for signed-out visitors: kept once a day per subject, never past the daily cap, never for a stock
 * outside the catalog, and never asked for by a page itself. No model, no network, no writes outside a Map.
 */

const NOW = new Date("2026-11-11T15:00:00Z");
const NVDA: AskExampleSubject = { kind: "stock", ticker: "NVDA" };
const answer = (text: string): AskUIMessage => ({ id: "a", role: "assistant", parts: [{ type: "text", text }] });
const catalogued = (ticker: string) => ["NVDA", "AAPL", "MSFT", "AMD"].includes(ticker);

function setup(cap?: number, perClient?: number) {
  const store = memoryAskExampleStore();
  const write = vi.fn(async (subject: AskExampleSubject) => answer(`About ${formatExampleSubject(subject)}.`));
  const get = (subject: AskExampleSubject, now: Date = NOW, client: string | null = null) =>
    getAskExample(subject, { store, write, isCatalogued: catalogued, now, cap, perClient, client });
  return { store, write, get };
}

describe("subjects", () => {
  it("reads only the two shapes", () => {
    expect(parseExampleSubject("stock:nvda")).toEqual(NVDA);
    expect(parseExampleSubject("market")).toEqual({ kind: "market" });
    for (const bad of ["", "stock:", "stock:../x", "portfolio", "stock:NVDA:1", null, 3, "x".repeat(300)]) expect(parseExampleSubject(bad)).toBeNull();
  });

  it("asks the panel's first question on a stock, and the market question on Today", () => {
    expect(exampleQuestion(NVDA)).toBe("What matters most for NVDA right now?");
    expect(exampleQuestion({ kind: "market" })).toBe(MARKET_EXAMPLE_QUESTION);
  });

  it("follows the page: a stock and its research for the stock, Today and the market pages for the market", () => {
    expect(pageExampleSubject({ pathname: "/stock/NVDA", pageContext: "stock:NVDA" })).toEqual(NVDA);
    expect(pageExampleSubject({ pathname: "/stock/NVDA/research/20261110T153012Z", pageContext: "research:NVDA:20261110T153012Z" })).toEqual(NVDA);
    expect(pageExampleSubject({ pathname: "/briefing", pageContext: null })).toEqual({ kind: "market" });
    expect(pageExampleSubject({ pathname: "/markets/today", pageContext: null })).toEqual({ kind: "market" });
    expect(pageExampleSubject({ pathname: "/portfolio", pageContext: "ex.portfolio" })).toBeNull();
    expect(pageExampleSubject({ pathname: "/", pageContext: null })).toBeNull();
  });

  it("keys a doc by subject, New York day and question", () => {
    expect(exampleDay(new Date("2026-11-12T03:00:00Z"))).toBe("2026-11-11");
    const id = exampleDocId(NVDA, "2026-11-11", exampleQuestion(NVDA));
    expect(id).toMatch(/^stock_NVDA__2026-11-11__[a-z0-9]+$/);
    expect(exampleDocId(NVDA, "2026-11-11", "Something else?")).not.toBe(id);
    expect(exampleDocId({ kind: "stock", ticker: "BRK.B" }, "2026-11-11", "q")).toMatch(/^stock_BRK_B__/);
  });
});

describe("getAskExample", () => {
  it("writes an example once, keeps it, and hands the kept copy to everyone after", async () => {
    const { store, write, get } = setup();
    const first = await get(NVDA);
    expect(first).toMatchObject({ status: "ready", example: { question: "What matters most for NVDA right now?", day: "2026-11-11" } });
    const second = await get(NVDA, new Date(NOW.getTime() + 3 * 3600_000));
    expect(second).toEqual(first);
    expect(write).toHaveBeenCalledTimes(1);
    expect(store.docs.get(capDocId("2026-11-11"))).toMatchObject({ count: 1 });
    // The kept doc is the finished answer, nothing else written.
    expect(Array.from(store.docs.keys()).sort()).toEqual([capDocId("2026-11-11"), exampleDocId(NVDA, "2026-11-11", exampleQuestion(NVDA))].sort());
  });

  it("writes a new one the next New York day", async () => {
    const { write, get } = setup();
    await get(NVDA);
    await get(NVDA, new Date("2026-11-12T15:00:00Z"));
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("stops writing at the daily cap, while examples already kept still show", async () => {
    const { store, write, get } = setup(2);
    expect((await get(NVDA)).status).toBe("ready");
    expect((await get({ kind: "market" })).status).toBe("ready");
    expect(await get({ kind: "stock", ticker: "AAPL" })).toEqual({ status: "unavailable", reason: "cap" });
    expect(write).toHaveBeenCalledTimes(2);
    expect(store.docs.get(capDocId("2026-11-11"))).toMatchObject({ count: 2 });
    // Over the cap, a kept example is still a read.
    expect((await get(NVDA)).status).toBe("ready");
    // A new day starts a new count.
    expect((await get({ kind: "stock", ticker: "AAPL" }, new Date("2026-11-12T15:00:00Z"))).status).toBe("ready");
  });

  it("lets one visitor set off only a few new examples a day, while kept ones stay readable to them", async () => {
    const { write, get } = setup(undefined, 2);
    expect((await get(NVDA, NOW, "visitor-a")).status).toBe("ready");
    expect((await get({ kind: "market" }, NOW, "visitor-a")).status).toBe("ready");
    expect(await get({ kind: "stock", ticker: "AAPL" }, NOW, "visitor-a")).toEqual({ status: "unavailable", reason: "client_cap" });
    expect((await get(NVDA, NOW, "visitor-a")).status).toBe("ready");
    // Someone else is not held back by it.
    expect((await get({ kind: "stock", ticker: "AAPL" }, NOW, "visitor-b")).status).toBe("ready");
    expect(write).toHaveBeenCalledTimes(3);
  });

  it("never writes for a stock outside the catalog, and never counts it", async () => {
    const { store, write, get } = setup();
    expect(await get({ kind: "stock", ticker: "ZZZZQ" })).toEqual({ status: "unavailable", reason: "not_covered" });
    expect(write).not.toHaveBeenCalled();
    expect(store.docs.size).toBe(0);
  });

  it("writes once when two visitors open the panel at the same moment", async () => {
    const { write, get } = setup();
    let finish!: () => void;
    write.mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve(answer("Slow.")))));
    const first = get(NVDA);
    // Let the first claim land before the second arrives.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await get(NVDA)).toEqual({ status: "pending" });
    finish();
    expect((await first).status).toBe("ready");
    expect((await get(NVDA)).status).toBe("ready");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("takes over an example abandoned mid-write", async () => {
    const { store, write, get } = setup();
    const id = exampleDocId(NVDA, "2026-11-11", exampleQuestion(NVDA));
    store.docs.set(id, { kind: "example", status: "generating", started_at: new Date(NOW.getTime() - ASK_EXAMPLE_STALE_MS - 1000).toISOString() });
    expect((await get(NVDA)).status).toBe("ready");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("after a failed write, waits before trying again, so a broken answer is not paid for on every visit", async () => {
    const { store, write, get } = setup();
    write.mockRejectedValueOnce(new Error("model down"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await get(NVDA)).toEqual({ status: "unavailable", reason: "failed" });
    expect(await get(NVDA, new Date(NOW.getTime() + 60_000))).toEqual({ status: "unavailable", reason: "failed" });
    expect(write).toHaveBeenCalledTimes(1);
    expect((await get(NVDA, new Date(NOW.getTime() + ASK_EXAMPLE_RETRY_MS + 1000))).status).toBe("ready");
    expect(write).toHaveBeenCalledTimes(2);
    expect(store.docs.get(capDocId("2026-11-11"))).toMatchObject({ count: 2 });
    quiet.mockRestore();
  });

  it("still shows the answer when keeping it fails", async () => {
    const { store, write, get } = setup();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    store.set = async () => {
      throw new Error("store down");
    };
    expect((await get(NVDA)).status).toBe("ready");
    expect(write).toHaveBeenCalledTimes(1);
    quiet.mockRestore();
  });

  it("does not write when the claim cannot be recorded", async () => {
    const { store, write, get } = setup();
    store.transact = async () => {
      throw new Error("store down");
    };
    await expect(get(NVDA)).rejects.toThrow("store down");
    expect(write).not.toHaveBeenCalled();
  });
});

/* ── pages never ask for an example ─────────────────────────────────────── */

const ROOT = join(__dirname, "..");

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) filesUnder(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(path);
  }
  return out;
}

describe("the cached signed-out pages never write an example", () => {
  const sources = [...filesUnder(join(ROOT, "app")), ...filesUnder(join(ROOT, "components")), ...filesUnder(join(ROOT, "lib"))].map((path) => ({
    path: relative(ROOT, path),
    text: readFileSync(path, "utf8"),
  }));

  it("only the example route reaches the writer", () => {
    const writers = sources.filter((file) => /from "@\/lib\/ask-examples-data"/.test(file.text)).map((file) => file.path);
    expect(writers).toEqual(["app/api/ask/example/route.ts"]);
  });

  it("only the Ask panel's conversation asks for one, and it is not part of any page", () => {
    const callers = sources.filter((file) => file.text.includes("/api/ask/example")).map((file) => file.path);
    expect(callers.filter((path) => path !== "app/api/ask/example/route.ts")).toEqual(["components/ask/ask-workspace.tsx"]);
    // The panel's code loads on first open: the host that every page carries only imports it lazily.
    const host = sources.find((file) => file.path === "components/ask/ask-panel-host.tsx")!.text;
    expect(host).toMatch(/dynamic\(\(\) => import\("@\/components\/ask\/ask-panel"\)/);
    expect(host).not.toMatch(/ask-examples/);
    expect(host).not.toMatch(/^import (?!type )[^;]*ask-workspace/m);
    // No server page or layout imports the example code.
    const pages = sources.filter((file) => /^app\/.*\/(page|layout)\.tsx$/.test(file.path) || /^app\/(page|layout)\.tsx$/.test(file.path));
    expect(pages.filter((file) => /ask-examples/.test(file.text)).map((file) => file.path)).toEqual([]);
  });

  it("asks only while the panel is open and nobody is signed in", () => {
    const panel = sources.find((file) => file.path === "components/ask/ask-panel.tsx")!.text;
    expect(panel).toMatch(/if \(open\) setExampleSubject\(pageExample\)/);
    expect(panel).toMatch(/if \(!viewer \|\| viewer\.signedIn\) return null/);
    const workspace = sources.find((file) => file.path === "components/ask/ask-workspace.tsx")!.text;
    expect(workspace).toMatch(/useAskExample\(panel && plan === "anonymous" \? exampleSubject : null\)/);
  });
});
