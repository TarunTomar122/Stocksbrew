import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("Markdown representation", () => {
  it("returns a Markdown recovery document for missing paths", async () => {
    const response = await GET(new Request("https://www.stocksbrew.online/missing"), { params: { path: ["missing"] } });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(response.headers.get("vary")).toBe("Accept");
    await expect(response.text()).resolves.toContain("/llms.txt");
  });
});
