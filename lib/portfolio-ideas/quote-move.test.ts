import { describe, expect, it } from "vitest";

import { sessionDayMove } from "./quote-move";

// Thursday Nov 12, 2026 in New York (EST, UTC−5).
const at = (iso: string) => new Date(iso);

describe("a quote's day move beside its price", () => {
  it("shows today's move once the session is open", () => {
    expect(sessionDayMove(1.4, "2026-11-12T15:10:00Z", at("2026-11-12T17:00:00Z"))).toBe(1.4);
  });

  it("never shows an older session's move as today's", () => {
    // Monday's move on Thursday afternoon.
    expect(sessionDayMove(-2.1, "2026-11-09T21:00:00Z", at("2026-11-12T17:00:00Z"))).toBeNull();
    // Wednesday's close after Thursday's open: the session has moved on.
    expect(sessionDayMove(-2.1, "2026-11-11T21:00:00Z", at("2026-11-12T17:00:00Z"))).toBeNull();
  });

  it("before the open, keeps the last session's move and today's premarket quote", () => {
    // 8:00 AM ET Thursday.
    const early = at("2026-11-12T13:00:00Z");
    expect(sessionDayMove(0.8, "2026-11-11T21:00:00Z", early)).toBe(0.8);
    expect(sessionDayMove(0.3, "2026-11-12T12:30:00Z", early)).toBe(0.3);
    expect(sessionDayMove(0.8, "2026-11-10T21:00:00Z", early)).toBeNull();
  });

  it("on a weekend or holiday, shows only the last trading day's move", () => {
    // Saturday Nov 14: Friday's close counts, Thursday's does not.
    const saturday = at("2026-11-14T16:00:00Z");
    expect(sessionDayMove(1.2, "2026-11-13T21:00:00Z", saturday)).toBe(1.2);
    expect(sessionDayMove(1.2, "2026-11-12T21:00:00Z", saturday)).toBeNull();
    // Thanksgiving, Thursday Nov 26: Wednesday's close counts.
    expect(sessionDayMove(-0.4, "2026-11-25T21:00:00Z", at("2026-11-26T16:00:00Z"))).toBe(-0.4);
  });

  it("treats any future stamp, a missing stamp or a missing move as nothing", () => {
    const now = at("2026-11-12T17:00:00Z");
    expect(sessionDayMove(1, "2026-11-12T17:10:00Z", now)).toBeNull();
    expect(sessionDayMove(1, "2026-11-12T17:00:01Z", now)).toBeNull();
    expect(sessionDayMove(1, "2026-11-12T17:00:00Z", now)).toBe(1);
    expect(sessionDayMove(1, null, now)).toBeNull();
    expect(sessionDayMove(1, "2026-11-12", now)).toBeNull();
    expect(sessionDayMove(null, "2026-11-12T15:00:00Z", now)).toBeNull();
    expect(sessionDayMove(Number.NaN, "2026-11-12T15:00:00Z", now)).toBeNull();
  });
});
