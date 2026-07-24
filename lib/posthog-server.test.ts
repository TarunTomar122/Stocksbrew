import { describe, expect, it } from "vitest";

import {
  POSTHOG_DOMAIN_SQL,
  POSTHOG_HUMAN_PAGEVIEW_SQL,
} from "@/lib/posthog-server";

describe("Stocksbrew analytics scope", () => {
  it("keeps current product analytics isolated from other sites in the shared PostHog project", () => {
    expect(POSTHOG_DOMAIN_SQL).toContain("stocksbrew.online");
    expect(POSTHOG_DOMAIN_SQL).not.toContain("tikrr.online");
    expect(POSTHOG_DOMAIN_SQL).not.toContain("yourtrace.online");
    expect(POSTHOG_DOMAIN_SQL).not.toContain("founder-exe.pages.dev");
  });

  it("filters automated traffic from visitor metrics", () => {
    expect(POSTHOG_HUMAN_PAGEVIEW_SQL).toContain("$virt_traffic_type");
    expect(POSTHOG_HUMAN_PAGEVIEW_SQL).toContain("Regular");
  });
});
