import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { BUNDLE, FIXED, LEAKY, freeResvg } from "./patch-next-og.mjs";

describe("patch-next-og", () => {
  const leaky = `function render() {\n  const resvgJS = new X();\n${LEAKY}}\n`;

  it("frees the Resvg instance and the rendered image", () => {
    const fixed = freeResvg(leaky);
    expect(fixed).toContain(FIXED);
    expect(fixed).not.toContain(LEAKY);
  });

  it("is idempotent", () => expect(freeResvg(freeResvg(leaky))).toBe(freeResvg(leaky)));

  it("refuses code it does not recognise", () => expect(() => freeResvg("return other();")).toThrow(/known form/));

  it("recognises the installed Next bundle (fails after a Next upgrade changes it)", () => {
    expect(() => freeResvg(fs.readFileSync(BUNDLE, "utf8"))).not.toThrow();
  });
});
