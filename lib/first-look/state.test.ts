import { describe, expect, it } from "vitest";

import { firstLookView, nextFirstLook, readFirstLook } from "./state";

const NOW = new Date("2026-11-13T15:00:00Z");
const started = { started_at: "2026-11-13T14:00:00Z", dismissed_at: null };
const base = { signedIn: true, stocks: 3, state: null, preview: false, lastRunAt: null, now: NOW };

describe("firstLookView", () => {
  it("shows nothing signed out or with no stocks, even on the preview", () => {
    expect(firstLookView({ ...base, signedIn: false, preview: true })).toEqual({ show: "none" });
    expect(firstLookView({ ...base, stocks: 0, preview: true })).toEqual({ show: "none" });
  });

  it("shows the preview to anyone signed in with stocks", () => {
    expect(firstLookView({ ...base, preview: true, state: { ...started, dismissed_at: "2026-11-13T14:30:00Z" } })).toEqual({ show: "panel", preview: true });
  });

  it("offers it once to someone who never had one", () => {
    expect(firstLookView(base)).toEqual({ show: "offer" });
  });

  it("shows an open look until it is dismissed, their first agent run lands, or a week passes", () => {
    expect(firstLookView({ ...base, state: started })).toEqual({ show: "panel", preview: false });
    expect(firstLookView({ ...base, state: started, lastRunAt: "2026-11-12T13:00:00Z" })).toEqual({ show: "panel", preview: false });
    expect(firstLookView({ ...base, state: started, lastRunAt: "2026-11-14T13:00:00Z" })).toEqual({ show: "none" });
    expect(firstLookView({ ...base, state: { ...started, dismissed_at: "2026-11-13T14:30:00Z" } })).toEqual({ show: "none" });
    expect(firstLookView({ ...base, state: started, now: new Date("2026-11-21T15:00:00Z") })).toEqual({ show: "none" });
  });
});

describe("readFirstLook", () => {
  it("reads the stored field and ignores junk", () => {
    expect(readFirstLook({ first_look: { started_at: "2026-11-13T14:00:00Z", source: "onboarding" } })).toEqual({ started_at: "2026-11-13T14:00:00Z", dismissed_at: null, source: "onboarding" });
    expect(readFirstLook({ first_look: { started_at: "soon" } })).toBeNull();
    expect(readFirstLook({ first_look: { started_at: "2026-11-13T14:00:00Z", source: "x" } })).toEqual({ started_at: "2026-11-13T14:00:00Z", dismissed_at: null });
    expect(readFirstLook(null)).toBeNull();
  });
});

describe("nextFirstLook", () => {
  it("starts once and never restarts", () => {
    expect(nextFirstLook(null, "start", NOW, "onboarding")).toEqual({ started_at: NOW.toISOString(), dismissed_at: null, source: "onboarding" });
    expect(nextFirstLook(started, "start", NOW)).toBeNull();
    expect(nextFirstLook({ ...started, dismissed_at: "2026-11-13T14:30:00Z" }, "start", NOW)).toBeNull();
  });

  it("dismisses an open look, records a closed preview, and never reopens", () => {
    expect(nextFirstLook({ ...started, source: "onboarding" }, "dismiss", NOW)).toEqual({ started_at: started.started_at, dismissed_at: NOW.toISOString(), source: "onboarding" });
    expect(nextFirstLook(null, "dismiss", NOW)).toEqual({ started_at: NOW.toISOString(), dismissed_at: NOW.toISOString(), source: "agent" });
    expect(nextFirstLook({ ...started, dismissed_at: "2026-11-13T14:30:00Z" }, "dismiss", NOW)).toBeNull();
  });
});
