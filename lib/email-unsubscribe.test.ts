import { describe, expect, it } from "vitest";

import { expectedToken, verifyUnsubscribe } from "./email-unsubscribe";

// Produced by backend/mail/send.py unsubscribe_token("abcUSER123", "daily") with secret "test-secret".
const PY_TOKEN = "Vz-M2boyqs2a1kkkfjIGLpAw";

describe("email unsubscribe tokens", () => {
  it("matches the token the Python sender signs", () => {
    expect(expectedToken("abcUSER123", "daily", "test-secret")).toBe(PY_TOKEN);
    expect(verifyUnsubscribe("abcUSER123", "daily", PY_TOKEN, "test-secret")).toBe(true);
  });

  it("only works for the account and category it was made for", () => {
    expect(verifyUnsubscribe("otherUSER1", "daily", PY_TOKEN, "test-secret")).toBe(false);
    expect(verifyUnsubscribe("abcUSER123", "weekly", PY_TOKEN, "test-secret")).toBe(false);
    expect(verifyUnsubscribe("abcUSER123", "nonsense", PY_TOKEN, "test-secret")).toBe(false);
    expect(verifyUnsubscribe("abcUSER123", "daily", PY_TOKEN.slice(1), "test-secret")).toBe(false);
  });

  it("fails closed without a secret", () => {
    expect(verifyUnsubscribe("abcUSER123", "daily", PY_TOKEN, "")).toBe(false);
  });
});
