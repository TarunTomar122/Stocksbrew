import { SENT_COPY, capturePromise, confirmHeadline, whenLine } from "@/lib/email-capture-copy";
import { countWords } from "@/lib/word-budget";

describe("email capture copy", () => {
  it("says one thing after a signup that is true for a new and a confirmed address alike", () => {
    // A confirmed subscriber who adds a stock gets no email, so the reply never promises one outright.
    expect(SENT_COPY).toBe("Done. If this email is new, check your inbox.");
    expect(countWords(SENT_COPY)).toBeLessThanOrEqual(10);
  });

  it("makes one promise, true to what the job sends: before the open, never every morning", () => {
    expect(capturePromise("NVDA")).toBe("Get NVDA in your inbox before the open");
    expect(capturePromise()).toBe("The day's biggest moves, before the open");
    for (const line of [capturePromise("BRK.B"), capturePromise(), confirmHeadline(["NVDA"]), confirmHeadline([]), whenLine([]), whenLine(["NVDA"]), whenLine(["NVDA", "AMD"])]) {
      expect(line).not.toMatch(/each morning|every morning|every day|daily|—|unlock/i);
    }
    expect(countWords(capturePromise("GOOGL"))).toBeLessThanOrEqual(10);
    expect(countWords(capturePromise())).toBeLessThanOrEqual(10);
    expect(whenLine(["NVDA"])).toMatch(/^Only on days NVDA moves a lot/);
  });
});
