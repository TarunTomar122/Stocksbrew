import { describe, expect, it } from "vitest";

import type { AgentJobDraft } from "@/lib/agent-jobs";
import { draftFromParam, draftHref, DRAFT_PARAM_MAX } from "@/lib/agent-jobs-link";

const HIDDEN = ["earnings-out"];

describe("agent drafts in the address", () => {
  it("round-trips a draft through the link", () => {
    const draft: Pick<AgentJobDraft, "template" | "trigger" | "scope"> = {
      template: "earnings-ahead",
      trigger: { type: "event", event: "earnings_approaching", days_before: 5 },
      scope: { kind: "tickers", tickers: ["NVDA"] },
    };
    const href = draftHref(draft);
    expect(href.startsWith("/agents?draft=")).toBe(true);
    const value = decodeURIComponent(href.slice("/agents?draft=".length));
    const back = draftFromParam(value, HIDDEN);
    expect(back).toMatchObject({ template: "earnings-ahead", trigger: { days_before: 5 }, scope: { kind: "tickers", tickers: ["NVDA"] } });
  });

  it("keeps the person's list as the scope", () => {
    const value = JSON.stringify({ template: "big-move", trigger: { type: "price", rule: "moves_pct", pct: 7 }, scope: { kind: "watchlist" } });
    expect(draftFromParam(value, HIDDEN)).toMatchObject({ scope: { kind: "watchlist" }, trigger: { pct: 7 } });
  });

  it("refuses anything that is not a valid draft", () => {
    expect(draftFromParam(undefined, HIDDEN)).toBeNull();
    expect(draftFromParam(["a", "b"], HIDDEN)).toBeNull();
    expect(draftFromParam("not json", HIDDEN)).toBeNull();
    expect(draftFromParam(JSON.stringify({ template: "nope" }), HIDDEN)).toBeNull();
    expect(draftFromParam(JSON.stringify({ template: "price-level", trigger: { level: -1 }, scope: { kind: "tickers", tickers: ["NVDA"] } }), HIDDEN)).toBeNull();
    expect(draftFromParam(JSON.stringify({ template: "earnings-out", scope: { kind: "watchlist" } }), HIDDEN)).toBeNull();
    expect(draftFromParam("x".repeat(DRAFT_PARAM_MAX + 1), HIDDEN)).toBeNull();
  });
});
