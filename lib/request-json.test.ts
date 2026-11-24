import { describe, expect, it } from "vitest";
import { readJsonObject } from "./request-json";

const post = (body: string) => new Request("https://example.test/api", { method: "POST", body });

describe("readJsonObject", () => {
  it("returns a plain object body", async () => {
    await expect(readJsonObject(post('{"idToken":"x"}'))).resolves.toEqual({ idToken: "x" });
  });

  it("returns null for JSON that is not an object, so routes answer 400 instead of throwing", async () => {
    for (const body of ["null", "[]", "[1]", "4", '"text"', "true"]) {
      await expect(readJsonObject(post(body))).resolves.toBeNull();
    }
  });

  it("returns null for an empty or broken body", async () => {
    await expect(readJsonObject(post(""))).resolves.toBeNull();
    await expect(readJsonObject(post("{nope"))).resolves.toBeNull();
  });
});
