import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {}, adminAuth: {} }));

import { agoText, buildSignups, dayText, dayWordsUtc, visibleRows, heardOf, MAX_ROWS, methodOf, planOfDoc, safePhoto, stampText, type AuthAccount } from "@/lib/analytics/signups";
import { authAccountOf, listAllAuth, loadSignups, setSignupsSourceForTests, type SignupsSource } from "@/lib/analytics/signups-load";
import { resolveIsSubscribed, type UserDoc } from "@/lib/watchlist";

const t = (iso: string) => Date.parse(iso);
const NOW = t("2026-11-13T15:30:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function auth(uid: string, created: string | null, extra: Partial<AuthAccount> = {}): AuthAccount {
  return {
    uid,
    email: `${uid}@example.com`,
    displayName: uid.toUpperCase(),
    photoURL: null,
    providers: ["google.com"],
    createdMs: created ? t(created) : null,
    lastSignInMs: created ? t(created) : null,
    lastRefreshMs: null,
    ...extra,
  };
}

describe("methodOf", () => {
  it("names the provider, Google first", () => {
    expect(methodOf(["google.com"])).toBe("google");
    expect(methodOf(["password", "google.com"])).toBe("google");
    expect(methodOf(["password"])).toBe("email");
    expect(methodOf(["emailLink"])).toBe("email");
    expect(methodOf(["phone"])).toBe("phone");
    expect(methodOf(["apple.com"])).toBe("other");
  });
  it("is unknown without providers", () => {
    expect(methodOf([])).toBeNull();
    expect(methodOf(undefined)).toBeNull();
  });
});

describe("planOfDoc", () => {
  const docs: Array<Record<string, unknown>> = [
    {},
    { is_subscribed: false },
    { is_subscribed: true },
    { is_subscribed: true, subscriptionId: "sub_1", subscriptionStatus: "active" },
    { is_subscribed: true, subscriptionId: "sub_1", subscriptionStatus: "active", cancelAtPeriodEnd: true },
    { subscriptionStatus: "trialing", subscriptionId: "sub_2" },
    { subscriptionStatus: "on_trial" },
    { is_subscribed: true, subscriptionStatus: "cancelled", subscriptionId: "sub_3" },
    { is_subscribed: true, subscriptionStatus: "payment_failed" },
    { is_subscribed: true, subscriptionStatus: "on_hold" },
    { is_subscribed: false, subscriptionStatus: "active" },
    { proGifted: true, proGiftExpiresAt: "2026-12-01T00:00:00Z" },
    { proGifted: true, proGiftExpiresAt: "2026-11-01T00:00:00Z" },
    { proGifted: true },
  ];

  it("gives Pro exactly when the app gives access (resolveIsSubscribed)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      for (const doc of docs) expect(planOfDoc(doc, NOW).plan !== "free", JSON.stringify(doc)).toBe(resolveIsSubscribed(doc as UserDoc));
    } finally {
      vi.useRealTimers();
    }
  });

  it("tells paying, trial, complimentary and gifted apart", () => {
    expect(planOfDoc({ is_subscribed: true, subscriptionId: "s", subscriptionStatus: "active" }, NOW)).toEqual({ plan: "pro", note: null, paying: true });
    expect(planOfDoc({ is_subscribed: true }, NOW)).toEqual({ plan: "pro", note: "complimentary", paying: false });
    expect(planOfDoc({ subscriptionStatus: "trialing", subscriptionId: "s" }, NOW)).toEqual({ plan: "trial", note: "on trial", paying: false });
    expect(planOfDoc({ proGifted: true, proGiftExpiresAt: "2026-12-01T00:00:00Z" }, NOW)).toEqual({ plan: "pro", note: "gifted", paying: false });
    expect(planOfDoc({ is_subscribed: true, subscriptionStatus: "payment_failed" }, NOW)).toEqual({ plan: "free", note: "payment failed", paying: false });
  });
});

describe("heardOf", () => {
  it("reads the survey answer, with the free text for other", () => {
    expect(heardOf({ heard_about_us: "reddit" })).toEqual({ id: "reddit", label: "Reddit", other: null });
    expect(heardOf({ heard_about_us: "other", heard_about_us_other: "  a podcast " })).toEqual({ id: "other", label: "Somewhere else", other: "a podcast" });
    expect(heardOf({ heard_about_us: "nonsense" })).toBeNull();
    expect(heardOf({ attribution_skipped: true })).toBeNull();
  });
});

describe("buildSignups", () => {
  it("counts today against yesterday by the same time, and the 7 and 30 days against the periods before", () => {
    const view = buildSignups({
      auth: [
        auth("today1", "2026-11-13T01:00:00Z"),
        auth("today2", "2026-11-13T15:00:00Z"),
        auth("yest-early", "2026-11-12T10:00:00Z"),
        auth("yest-late", "2026-11-12T20:00:00Z"), // after 15:30 yesterday: not "by now"
        auth("d6", "2026-11-07T00:00:00Z"), // first day of the 7
        auth("d8", "2026-11-06T12:00:00Z"), // the week before
        auth("prevweek-late", "2026-11-06T18:00:00Z"), // last day of the week before, after 15:30: not counted
        auth("d29", "2026-10-15T00:00:00Z"), // first day of the 30
        auth("d31", "2026-10-14T10:00:00Z"), // the 30 days before, before 15:30 on their last day
        auth("future", "2026-11-14T00:00:00Z"),
      ],
      docs: [],
      agents: [],
      now: NOW,
    });
    expect(view.today.count).toBe(2);
    expect(view.today.yesterday).toBe(1);
    expect(view.today.hours).toHaveLength(16);
    expect(view.today.hours[1]).toBe(1);
    expect(view.today.hours[15]).toBe(1);
    expect(view.week.count).toBe(5);
    expect(view.week.days).toEqual([1, 0, 0, 0, 0, 2, 2]);
    expect(view.week.previous).toBe(1);
    expect(view.month.count).toBe(8);
    expect(view.month.days).toHaveLength(30);
    expect(view.month.days[0]).toBe(1);
    expect(view.month.previous).toBe(1);
    expect(view.total).toBe(10);
    expect(view.firstMs).toBe(t("2026-10-14T10:00:00Z"));
  });

  it("says who came back a day or more after signing up, out of accounts at least a day old", () => {
    const view = buildSignups({
      auth: [
        auth("back", "2026-11-01T00:00:00Z", { lastRefreshMs: t("2026-11-05T00:00:00Z") }),
        auth("same-day", "2026-11-01T00:00:00Z", { lastRefreshMs: t("2026-11-01T05:00:00Z") }),
        auth("too-new", "2026-11-13T10:00:00Z", { lastRefreshMs: t("2026-11-13T15:00:00Z") }),
        auth("never-seen", "2026-11-01T00:00:00Z", { lastSignInMs: null }),
      ],
      docs: [{ uid: "same-day", data: { briefing_visits: { last_at: "2026-11-03T00:00:00Z" } } }],
      agents: [],
      now: NOW,
    });
    const byId = new Map(view.rows.map((r) => [r.uid, r]));
    expect(byId.get("back")!.cameBack).toBe(true);
    // The briefing visit two days later counts as seen.
    expect(byId.get("same-day")!.cameBack).toBe(true);
    expect(byId.get("same-day")!.lastSeenMs).toBe(t("2026-11-03T00:00:00Z"));
    expect(byId.get("too-new")!.cameBack).toBeNull();
    expect(byId.get("never-seen")!.cameBack).toBe(false);
    expect(byId.get("never-seen")!.lastSeenMs).toBeNull();
    expect(view.cameBack).toEqual({ count: 2, eligible: 3 });
  });

  it("joins Auth, docs and agents, and leaves what it doesn't know blank, not zero", () => {
    const view = buildSignups({
      auth: [auth("both", "2026-11-10T00:00:00Z", { providers: ["password"] }), auth("auth-only", "2026-11-11T00:00:00Z")],
      docs: [
        { uid: "both", data: { tracked_stocks: ["US_NVDA", "US_AMD"], is_subscribed: true, subscriptionId: "s", subscriptionStatus: "active", heard_about_us: "x" } },
        // A billing-only doc with no Auth record is not an account.
        { uid: "billing-only", data: { is_subscribed: true, subscriptionId: "s2", subscriptionStatus: "active" } },
      ],
      agents: [
        { uid: "both", on: true },
        { uid: "both", on: true },
        { uid: "both", on: false },
        { uid: "auth-only", on: false },
      ],
      now: NOW,
    });
    expect(view.rows.map((r) => r.uid)).toEqual(["auth-only", "both"]);
    const [authOnly, both] = view.rows;
    expect(both).toMatchObject({ method: "email", plan: "pro", paying: true, stocks: 2, agents: 2, heard: { id: "x" } });
    expect(authOnly).toMatchObject({ method: "google", plan: null, stocks: null, agents: 0, heard: null });
    expect(view.total).toBe(2);
    expect(view.addedStocks).toEqual({ count: 1, known: 1 });
    expect(view.agentsOn).toEqual({ count: 1 });
    expect(view.pro).toEqual({ count: 1, paying: 1, trial: 0 });
    expect(view.authMissing).toBe(false);
  });

  it("works from the profile docs alone when Auth didn't answer, and without agents when they didn't load", () => {
    const view = buildSignups({
      auth: null,
      docs: [
        { uid: "a", data: { created_at: "2026-11-13T09:00:00Z", tracked_stocks: [] } },
        { uid: "b", data: { email: "b@example.com", display_name: "Bee", created_at: { _seconds: t("2026-11-12T00:00:00Z") / 1000 } } },
        { uid: "billing-only", data: { is_subscribed: true } },
      ],
      agents: null,
      now: NOW,
    });
    expect(view.authMissing).toBe(true);
    expect(view.rows.map((r) => r.uid)).toEqual(["a", "b"]);
    expect(view.rows[0]).toMatchObject({ uid: "a", method: null, agents: null, stocks: 0, plan: "free" });
    expect(view.rows[1]).toMatchObject({ email: "b@example.com", name: "Bee", createdMs: t("2026-11-12T00:00:00Z") });
    expect(view.today.count).toBe(1);
    // Unknown, not zero.
    expect(view.agentsOn).toBeNull();
  });

  it("puts accounts without a sign-up time last, and shows the newest MAX_ROWS until all are asked for", () => {
    const many = Array.from({ length: MAX_ROWS + 5 }, (_, i) => auth(`u${String(i).padStart(4, "0")}`, new Date(NOW - (i + 1) * HOUR).toISOString()));
    const view = buildSignups({ auth: [auth("nodate", null), ...many], docs: [], agents: [], now: NOW });
    expect(view.total).toBe(MAX_ROWS + 6);
    expect(view.rows[view.rows.length - 1]!.uid).toBe("nodate");
    const shown = visibleRows(view, false);
    expect(shown).toHaveLength(MAX_ROWS);
    expect(shown[0]!.uid).toBe("u0000");
    expect(shown.some((r) => r.uid === "nodate")).toBe(false);
    // "Show all" reaches every account.
    expect(visibleRows(view, true)).toHaveLength(MAX_ROWS + 6);
  });

  it("is empty for no accounts", () => {
    const view = buildSignups({ auth: [], docs: [], agents: [], now: NOW });
    expect(view.total).toBe(0);
    expect(view.firstMs).toBeNull();
    expect(view.cameBack).toEqual({ count: 0, eligible: 0 });
  });
});

describe("listAllAuth", () => {
  it("follows page tokens to the end", async () => {
    const pages: Record<string, { users: AuthAccount[]; pageToken?: string }> = {
      "": { users: [auth("a", null), auth("b", null)], pageToken: "p2" },
      p2: { users: [auth("c", null)], pageToken: "p3" },
      p3: { users: [auth("d", null)] },
    };
    const seen: Array<string | undefined> = [];
    const users = await listAllAuth(async (token) => {
      seen.push(token);
      return pages[token ?? ""]!;
    });
    expect(users.map((u) => u.uid)).toEqual(["a", "b", "c", "d"]);
    expect(seen).toEqual([undefined, "p2", "p3"]);
  });

  it("stops on a repeated token and at the page limit", async () => {
    const loop = vi.fn(async () => ({ users: [auth("x", null)], pageToken: "same" }));
    expect(await listAllAuth(loop)).toHaveLength(2);
    let n = 0;
    const endless = async () => ({ users: [auth(`y${n}`, null)], pageToken: `t${n++}` });
    expect(await listAllAuth(endless, 3)).toHaveLength(3);
  });
});

describe("authAccountOf", () => {
  it("reads the record's metadata", () => {
    const account = authAccountOf({
      uid: "u",
      email: "u@example.com",
      providerData: [{ providerId: "google.com" }],
      metadata: { creationTime: "Thu, 12 Nov 2026 10:00:00 GMT", lastSignInTime: "Thu, 12 Nov 2026 10:00:00 GMT", lastRefreshTime: null },
    });
    expect(account).toMatchObject({ uid: "u", providers: ["google.com"], createdMs: t("2026-11-12T10:00:00Z"), lastRefreshMs: null, displayName: null });
  });
});

describe("loadSignups", () => {
  afterEach(() => setSignupsSourceForTests());

  function fake(overrides: Partial<SignupsSource> = {}) {
    const source: SignupsSource = {
      listAuthPage: vi.fn(async () => ({ users: [auth("a", "2026-11-13T10:00:00Z")] })),
      readDocs: vi.fn(async () => [{ uid: "a", data: { created_at: "2026-11-13T10:00:00Z", tracked_stocks: ["US_NVDA"] } }]),
      readAgents: vi.fn(async () => [{ uid: "a", on: true }]),
      ...overrides,
    };
    setSignupsSourceForTests(source);
    return source;
  }

  it("reads once a minute", async () => {
    const source = fake();
    const first = await loadSignups(NOW);
    await loadSignups(NOW + 59_000);
    expect(source.readDocs).toHaveBeenCalledTimes(1);
    await loadSignups(NOW + 61_000);
    expect(source.readDocs).toHaveBeenCalledTimes(2);
    expect(first.rows[0]).toMatchObject({ uid: "a", stocks: 1, agents: 1 });
  });

  it("reads again when the clock goes back", async () => {
    const source = fake();
    await loadSignups(NOW);
    await loadSignups(NOW - 5_000);
    expect(source.readDocs).toHaveBeenCalledTimes(2);
  });

  it("doesn't keep a failed load", async () => {
    let fail = true;
    const source = fake({
      readDocs: vi.fn(async () => {
        if (fail) throw new Error("down");
        return [];
      }),
    });
    await expect(loadSignups(NOW)).rejects.toThrow("down");
    fail = false;
    await expect(loadSignups(NOW + 1000)).resolves.toMatchObject({ total: 1 });
    expect(source.readDocs).toHaveBeenCalledTimes(2);
  });

  it("still loads when Auth or the agents fail", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fake({
      listAuthPage: vi.fn(async () => {
        throw new Error("no credentials");
      }),
      readAgents: vi.fn(async () => {
        throw new Error("no agents");
      }),
    });
    const view = await loadSignups(NOW);
    expect(view.authMissing).toBe(true);
    expect(view.rows[0]).toMatchObject({ uid: "a", agents: null, method: null });
    warn.mockRestore();
  });
});

describe("safePhoto", () => {
  it("loads only Google's photo host over https", () => {
    expect(safePhoto("https://lh3.googleusercontent.com/a/abc=s96-c")).toBe("https://lh3.googleusercontent.com/a/abc=s96-c");
    expect(safePhoto("http://lh3.googleusercontent.com/a/abc")).toBeNull();
    expect(safePhoto("https://tracker.example.com/pixel.gif")).toBeNull();
    expect(safePhoto("https://googleusercontent.com.evil.example/x")).toBeNull();
    expect(safePhoto("javascript:alert(1)")).toBeNull();
    expect(safePhoto("not a url")).toBeNull();
    expect(safePhoto(null)).toBeNull();
  });
  it("drops an untrusted photo in the rows", () => {
    const view = buildSignups({ auth: [auth("a", "2026-11-12T00:00:00Z", { photoURL: "https://tracker.example.com/p.gif" })], docs: [], agents: [], now: NOW });
    expect(view.rows[0]!.photo).toBeNull();
  });
});

describe("time words", () => {
  it("names the UTC day: today, yesterday, the weekday, then the date", () => {
    expect(dayWordsUtc(t("2026-11-13T00:10:00Z"), NOW)).toBe("today");
    expect(dayWordsUtc(t("2026-11-12T23:59:00Z"), NOW)).toBe("yesterday");
    expect(dayWordsUtc(t("2026-11-09T12:00:00Z"), NOW)).toBe("Monday");
    expect(dayWordsUtc(t("2026-11-07T12:00:00Z"), NOW)).toBe("Saturday");
    expect(dayWordsUtc(t("2026-11-06T12:00:00Z"), NOW)).toBe("Nov 6");
    expect(dayWordsUtc(null, NOW)).toBe("");
  });

  it("says how long ago", () => {
    expect(agoText(null, NOW)).toBe("");
    expect(agoText(NOW - 20_000, NOW)).toBe("just now");
    expect(agoText(NOW - 12 * 60_000, NOW)).toBe("12 min ago");
    expect(agoText(NOW - 3 * HOUR, NOW)).toBe("3 h ago");
    expect(agoText(NOW - 30 * HOUR, NOW)).toBe("1 day ago");
    expect(agoText(NOW - 4 * DAY, NOW)).toBe("4 days ago");
    expect(agoText(NOW - 90 * DAY, NOW)).toBe("3 months ago");
    expect(agoText(NOW + HOUR, NOW)).toBe("just now");
  });
  it("gives the UTC day, with the year only when it differs", () => {
    expect(dayText(t("2026-11-12T23:30:00Z"), NOW)).toBe("Nov 12");
    expect(dayText(t("2025-12-31T10:00:00Z"), NOW)).toBe("Dec 31, 2025");
    expect(dayText(null, NOW)).toBe("");
    expect(stampText(t("2026-11-12T14:05:00Z"))).toBe("Nov 12, 2026, 14:05 UTC");
  });
});
