import { SENT_COPY } from "@/components/email-capture";
import { countWords } from "@/lib/word-budget";

describe("email capture copy", () => {
  it("says one thing after a signup that is true for a new and a confirmed address alike", () => {
    // A confirmed subscriber who adds a stock gets no email, so the reply never promises one outright.
    expect(SENT_COPY).toBe("Done. If this email is new, check your inbox.");
    expect(SENT_COPY).not.toMatch(/^check your inbox/i);
    expect(countWords(SENT_COPY)).toBeLessThanOrEqual(10);
    expect(SENT_COPY).not.toMatch(/—|unlock/i);
  });
});
