import { describe, expect, it } from "vitest";

import { replyRoute, savedNote } from "./reply";

describe("reply routing", () => {
  it("sends plain instructions to the agents' reader", () => {
    for (const text of ["watch AMD for a 5% drop", "Tell me when NVDA reports", "please alert me if TSLA closes below 200", "Can you keep an eye on AAPL?", "let me know when MSFT drops 3%", "I want you to tell me if NVDA falls 10%", "track NVDA for a 5% drop"]) {
      expect(replyRoute(text)).toBe("instruction");
    }
  });

  it("sends questions to Ask", () => {
    for (const text of ["Why did NVDA move?", "should I watch AMD?", "How did my stocks do this week?", "what is the watch list doing", "Tell me about NVDA", "tell me why AMD fell", "Track record of NVDA calls?", "Let me know what you think of AMD", ""]) {
      expect(replyRoute(text)).toBe("question");
    }
  });
});

describe("what the agent says after saving", () => {
  it("says it is on and that the findings land here", () => {
    expect(savedNote({ saved: [{ name: "AMD falls 5%", enabled: true }], already: [], limit: 2 })).toBe("Done. “AMD falls 5%” is on, and I'll write here when it finds something.");
  });

  it("uses the agents page's own words for paused and existing agents, pointed at the thread", () => {
    const text = savedNote({ saved: [{ name: "A", enabled: true }, { name: "B", enabled: false }], already: ["C"], limit: 1 });
    expect(text).toContain("I'll write here when it finds something.");
    expect(text).toContain("saved and paused");
    expect(text).toContain("You already had “C”");
    expect(text).not.toContain("below");
  });
});
