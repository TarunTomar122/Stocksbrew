import { describe, expect, it } from "vitest";

import { parseAskPageHint, serializeAskPageHint } from "@/lib/ask-page-hint";

describe("the page's hint to the Ask panel", () => {
  it("round-trips the item and the questions", () => {
    const hint = { context: "ex.portfolio", questions: [{ question: "Is the reason for owning UNH still holding up?", href: "/ask?q=x&ctx=ex.reason%3AUNH" }] };
    expect(parseAskPageHint(serializeAskPageHint(hint))).toEqual(hint);
    expect(parseAskPageHint(serializeAskPageHint({ context: null, questions: [] }))).toEqual({ context: null, questions: [] });
  });

  it("can never close its script element", () => {
    const text = serializeAskPageHint({ context: null, questions: [{ question: "</script><script>alert(1)</script>", href: "/ask?q=1" }] });
    expect(text).not.toContain("<");
    expect(parseAskPageHint(text)!.questions[0]!.question).toBe("</script><script>alert(1)</script>");
  });

  it("keeps only links into Ask and drops anything malformed", () => {
    const raw = JSON.stringify({
      context: "  ",
      questions: [{ question: "Fine?", href: "/ask?q=fine" }, { question: "Away?", href: "https://example.com/ask?q=1" }, { question: "", href: "/ask?q=2" }, null, "text"],
    });
    expect(parseAskPageHint(raw)).toEqual({ context: null, questions: [{ question: "Fine?", href: "/ask?q=fine" }] });
    expect(parseAskPageHint("not json")).toBeNull();
    expect(parseAskPageHint(null)).toBeNull();
  });
});
