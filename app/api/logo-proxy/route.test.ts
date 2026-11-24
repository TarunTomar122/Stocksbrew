import { NextRequest } from "next/server";
import sharp from "sharp";

const stored: Record<string, Record<string, unknown>> = {};

vi.mock("@/lib/firebase-admin", () => ({
  adminFirestore: {
    collection: () => ({
      doc: (key: string) => ({ get: async () => ({ exists: key in stored, data: () => stored[key] }) }),
    }),
  },
}));

describe("/api/logo-proxy", () => {
  it("serves the app's own stored tile as a PNG before any third-party logo (Finnhub's GOOGL reads as Adobe)", async () => {
    const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#4285f4" } }).webp().toBuffer();
    stored.GOOGL = { status: "ok", mime: "image/webp", data_b64: webp.toString("base64") };
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("@/app/api/logo-proxy/route");
    const res = await GET(new NextRequest("http://localhost/api/logo-proxy?ticker=GOOGL&fallback=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(1, 4).toString()).toBe("PNG");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("falls back to the lettered PNG when there is no stored tile and every source fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const { GET } = await import("@/app/api/logo-proxy/route");
    const res = await GET(new NextRequest("http://localhost/api/logo-proxy?ticker=ZZZQ&fallback=1"));
    expect(res.headers.get("content-type")).toBe("image/png");
    fetchSpy.mockRestore();
  });
});
