import { describe, expect, it } from "vitest";

import { canonicalAgentRadarLabel } from "@/lib/agent-radar-labels";

describe("canonical agent radar labels", () => {
  it("replaces stale materialized names with the instrument catalog label", () => {
    expect(canonicalAgentRadarLabel(
      { ticker: "SMCI", instrument_name: "Airbnb" },
      { ticker: "SMCI", name: "Super Micro Computer" },
    )).toEqual({ ticker: "SMCI", name: "Super Micro Computer" });
  });

  it("falls back to the ticker instead of returning an untrusted stale name", () => {
    expect(canonicalAgentRadarLabel(
      { ticker: "NVDA", instrument_name: "Coherent" },
    )).toEqual({ ticker: "NVDA", name: "NVDA" });
  });
});
