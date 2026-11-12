import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// A browser-like window for the store's listener, set before the store module loads.
const target = new EventTarget();
vi.stubGlobal("window", target);
vi.stubGlobal("React", React);

const replies: Array<{ theses: Record<string, unknown>; held: string[] }> = [
  { theses: { US_AAPL: { kind: "growth", reason: "old" } }, held: ["US_AAPL"] },
  { theses: { US_NVDA: { kind: "growth", reason: null } }, held: ["US_NVDA"] },
];
const fetchMock = vi.fn(async () => new Response(JSON.stringify(replies.shift() ?? { theses: {}, held: [] }), { status: 200 }));
vi.stubGlobal("fetch", fetchMock);

const { getThesis, loadTheses, putTheses, subscribe, useHeld } = await import("@/components/thesis/store");
const { dispatchRadarTrackChanged } = await import("@/lib/radar-track-events");

function Held() {
  return <span>{useHeld().join(",")}</span>;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the reasons store after a change to the person's list (bug 11)", () => {
  it("reloads in place, so a removed holding's reason goes and a new holding shows, without a full reload", async () => {
    const stop = subscribe(() => undefined); // a mounted part of the page that shows reasons
    loadTheses({ checkAll: false });
    await settle();
    expect(renderToStaticMarkup(<Held />)).toContain("US_AAPL");
    dispatchRadarTrackChanged({ action: "remove" });
    await settle();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const html = renderToStaticMarkup(<Held />);
    expect(html).toContain("US_NVDA");
    expect(html).not.toContain("US_AAPL");
    stop();
  });

  it("keeps a reason saved while the reload was on its way, and does nothing with no part of the page listening", async () => {
    const stop = subscribe(() => undefined);
    let answer: (value: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { answer = resolve; }));
    dispatchRadarTrackChanged({ action: "edit" });
    putTheses({ US_MSFT: { kind: "growth", reason: "saved meanwhile", created_at: "", updated_at: "" } });
    answer(new Response(JSON.stringify({ theses: { US_NVDA: { kind: "growth", reason: null } }, held: ["US_NVDA", "US_MSFT"] }), { status: 200 }));
    await settle();
    await settle();
    expect(getThesis("US_MSFT")?.reason).toBe("saved meanwhile");
    expect(getThesis("US_NVDA")).not.toBeNull();
    stop();
    const calls = fetchMock.mock.calls.length;
    dispatchRadarTrackChanged({ action: "edit" });
    await settle();
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
