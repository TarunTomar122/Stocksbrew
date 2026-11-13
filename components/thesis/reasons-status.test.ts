import { describe, expect, it } from "vitest";

import { REASONS_WORDS, reasonsStatus } from "@/components/thesis/reasons-status";

const counts = (broken = 0, weaker = 0, played_out = 0, holds = 0) => ({ broken, weaker, played_out, holds });
const words = (out: { text: string; thesis: string | null }) => `${out.text} ${out.thesis ?? ""}`.split(/\s+/).filter(Boolean).length;

describe("reasonsStatus", () => {
  it("says the status in a few words, with the thesis count when it fits (judge90: 22 words before)", () => {
    const out = reasonsStatus({ withReason: 2, total: 10, counts: counts(0, 0, 0, 2), inThesis: 6 });
    expect(out).toEqual({ text: "Reasons on 2 of 10 holdings still hold.", thesis: "6 in your thesis." });
    expect(words(out)).toBeLessThanOrEqual(REASONS_WORDS);
  });

  it("leads with what is wrong", () => {
    expect(reasonsStatus({ withReason: 3, total: 10, counts: counts(1, 1, 0, 1), inThesis: 0 }).text).toBe("1 reason looks broken and 1 is weaker.");
    expect(reasonsStatus({ withReason: 5, total: 10, counts: counts(0, 2, 1, 2), inThesis: 0 }).text).toBe("2 reasons are weaker and 1 has played out.");
  });

  it("drops the thesis count rather than run over the budget", () => {
    const out = reasonsStatus({ withReason: 6, total: 10, counts: counts(1, 2, 1, 2), inThesis: 6 });
    expect(out.text).toBe("1 reason looks broken, 2 are weaker and 1 has played out.");
    expect(out.thesis).toBeNull();
  });

  it("covers no reasons yet, none checked yet, and some checked", () => {
    expect(reasonsStatus({ withReason: 0, total: 4, counts: counts(), inThesis: 0 }).text).toBe("Give each holding a reason for your agent to check.");
    expect(reasonsStatus({ withReason: 3, total: 10, counts: counts(), inThesis: 0 }).text).toBe("Reasons on 3 of 10 holdings.");
    expect(reasonsStatus({ withReason: 3, total: 10, counts: counts(0, 0, 0, 2), inThesis: 0 }).text).toBe("Reasons on 3 of 10 holdings. 2 checked still hold.");
    expect(reasonsStatus({ withReason: 4, total: 4, counts: counts(0, 0, 0, 4), inThesis: 0 }).text).toBe("Reasons on all 4 holdings still hold.");
    expect(reasonsStatus({ withReason: 1, total: 10, counts: counts(0, 0, 0, 1), inThesis: 0 }).text).toBe("Your reason on 1 of 10 holdings still holds.");
    expect(reasonsStatus({ withReason: 1, total: 1, counts: counts(0, 0, 0, 1), inThesis: 0 }).text).toBe("Your reason still holds.");
    // One reason: singular in every state.
    expect(reasonsStatus({ withReason: 1, total: 10, counts: counts(), inThesis: 0 }).text).toBe("Your reason on 1 of 10 holdings.");
    expect(reasonsStatus({ withReason: 1, total: 1, counts: counts(), inThesis: 0 }).text).toBe("You gave your one holding a reason.");
  });

  it("stays within the budget in every case", () => {
    for (let broken = 0; broken < 3; broken += 1)
      for (let weaker = 0; weaker < 3; weaker += 1)
        for (let played = 0; played < 3; played += 1) {
          const out = reasonsStatus({ withReason: 20, total: 30, counts: counts(broken, weaker, played, 3), inThesis: 12 });
          expect(words(out), out.text).toBeLessThanOrEqual(REASONS_WORDS);
        }
  });
});
