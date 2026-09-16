import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("homepage live proof movers", () => {
  it("only shows movers with a research-backed narrative", () => {
    const landing = source("components/oa/oa-landing.tsx");

    expect(landing).toContain("(anomaliesDoc?.anomalies ?? []).filter(");
    expect(landing).toContain("hasResearchBackedNarrative");
    expect(landing).not.toContain(
      "const movers = anomaliesDoc?.anomalies ?? [];",
    );
  });
});
