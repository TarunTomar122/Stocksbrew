import { describe, expect, it } from "vitest";

import { openedCard } from "@/components/ask/context-pin";
import type { AskUIMessage } from "@/lib/ask-cards";

const user = { id: "u", role: "user", parts: [{ type: "text", text: "Hi" }] };
const msgs = (...parts: unknown[]) => [user, { id: "a", role: "assistant", parts }] as unknown as AskUIMessage[];

describe("the card the server opened for the pin", () => {
  it("is null before any answer", () => {
    expect(openedCard([user] as unknown as AskUIMessage[])).toBeNull();
    expect(openedCard(msgs())).toBeNull();
  });

  it("finds the ctx- lookup once it has finished", () => {
    const card = { card: "quote", ticker: "NVDA" };
    expect(openedCard(msgs({ type: "tool-get_stock", toolCallId: "ctx-1", state: "input-available" }))).toBeNull();
    expect(openedCard(msgs({ type: "tool-get_stock", toolCallId: "ctx-1", state: "output-available", output: card }, { type: "text", text: "x" }))).toEqual(card);
  });

  it("says missing when the answer went on without it", () => {
    expect(openedCard(msgs({ type: "text", text: "No report found." }))).toBe("missing");
    expect(openedCard(msgs({ type: "tool-get_news", toolCallId: "call_1", state: "output-available", output: { card: "news" } }))).toBe("missing");
  });
});
