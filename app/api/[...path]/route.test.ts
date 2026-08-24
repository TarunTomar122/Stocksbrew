import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("unknown API routes", () => {
  it("returns a structured JSON 404", async () => {
    const response = GET(new Request("https://www.stocksbrew.online/api/v1/missing"));
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "api_route_not_found", path: "/api/v1/missing", hint: expect.stringContaining("openapi.json") },
    });
  });
});
