import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("homepage live proof movers", () => {
  it("passes every anomaly through without narrative or row-count filtering", () => {
    const landing = source("components/oa/oa-landing.tsx");

    expect(landing).toContain("const movers = anomaliesDoc?.anomalies ?? [];");
    expect(landing).not.toContain(
      "const movers = (anomaliesDoc?.anomalies ?? [])\n    .filter((a) => !isWeakMoveExplanation(a) && !hasUnverifiedNarrative(a))\n    .slice(0, 5);",
    );
  });
});
