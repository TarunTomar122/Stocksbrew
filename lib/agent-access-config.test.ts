import { normalizeAgentScopes } from "@/lib/agent-access-config";

describe("normalizeAgentScopes", () => {
  it("keeps supported scopes, removes duplicates, and drops unknown scopes", () => {
    expect(normalizeAgentScopes("stocks:read unknown stocks:read radar:read alerts:write")).toEqual([
      "stocks:read",
      "radar:read",
      "alerts:write",
    ]);
  });

  it("returns an empty list when nothing valid was requested", () => {
    expect(normalizeAgentScopes(null)).toEqual([]);
    expect(normalizeAgentScopes("admin:write")).toEqual([]);
  });
});
