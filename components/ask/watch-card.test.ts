import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { WatchCard } from "@/lib/ask-cards";

vi.mock("@/components/stock-logo", () => ({ StockLogo: () => null }));
// The test runner compiles JSX to React.createElement (the app's build uses the automatic runtime), so the components
// need React in scope here.
vi.stubGlobal("React", React);

const { AskCardView } = await import("@/components/ask/cards");

const BASE: WatchCard = {
  card: "watch",
  status: "ready",
  request: "Tell me when NVDA moves 5% in a day",
  preview: "I'll watch NVIDIA (NVDA) and tell you when it moves 5% or more in a day, up or down.",
  href: "/agents?q=Tell%20me%20when%20NVDA%20moves%205%25%20in%20a%20day",
  existing: [],
  note: null,
  rule: { what: ["NVIDIA moves 5% or more in a day, up or down"], stocks: [{ ticker: "NVDA", name: "NVIDIA" }], mine: false },
  drafts: [{ template: "big-move", name: "NVDA moves 5%", trigger: { type: "price", rule: "daily_move", pct: 5 } as never, scope: { kind: "tickers", tickers: ["NVDA"] } }],
  outlook: null,
  source: "Nothing is set up until you save it on the Agents page",
  as_of: null,
  source_url: "/agents",
};

function html(card: WatchCard, signedIn: boolean): string {
  return renderToStaticMarkup(React.createElement(AskCardView, { card, actions: { signedIn, ask: () => {}, signIn: () => {} } }));
}

const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("the watch card", () => {
  it("reads the watch back in the watch box's words, then which stock, when it checks and how it tells you", () => {
    const shown = text(html(BASE, true));
    expect(shown).toContain(BASE.preview);
    expect(shown).not.toContain("What NVIDIA");
    expect(shown).toMatch(/Stock NVDA NVIDIA/);
    expect(shown).toMatch(/When Every weekday after the close, from 5:30 PM ET\./);
    expect(shown).toContain("How An email and a note on your Agents page, only on a day it happens.");
  });

  it("signed in, offers a one-tap setup (a button, not a link) and a way to change it first", () => {
    const markup = html(BASE, true);
    expect(markup).toMatch(/<button[^>]*>(?:(?!<\/button>).)*Save this watch/);
    expect(markup).toContain(`href="${BASE.href.replace(/&/g, "&amp;")}"`);
    expect(text(markup)).not.toContain("Nothing is set up");
  });

  it("signed out, the same button opens the Agents page with the request filled in", () => {
    const markup = html(BASE, false);
    expect(markup).not.toMatch(/<button/);
    expect(markup).toMatch(/<a[^>]*href="\/agents\?q=[^"]+"[^>]*>Save this watch<\/a>/);
  });

  it("warns before the tap when the plan would save it paused, and sends a full account to its agents", () => {
    const paused = html({ ...BASE, outlook: { kind: "paused", line: "Free runs one agent at a time and you have 1 on, so this one will be saved paused." } }, true);
    expect(text(paused)).toContain("so this one will be saved paused.");
    expect(paused).toMatch(/<button/);
    const full = html({ ...BASE, outlook: { kind: "full", line: "You have 20 agents, the most one account can keep." } }, true);
    expect(full).not.toMatch(/<button/);
    expect(text(full)).toContain("Open your agents");
  });

  it("asked when to sell, shows only the one-tap question until it is tapped", () => {
    const zone = { side: "sell" as const, call: "Sell some" as const, level: 250, price: 230, gap_pct: 8.7, locked: false, answer: "Our call on NVIDIA is Sell some at $250." };
    const markup = html({ ...BASE, zone, offer: "Want me to tell you when it gets there?" }, true);
    expect(markup).toMatch(/<button[^>]*type="button"[^>]*>Want me to tell you when it gets there\?<\/button>/);
    expect(text(markup)).not.toContain(BASE.preview);
    expect(markup).not.toContain("Save this watch");
    // Already set up: no question, just what they have.
    const have = text(html({ ...BASE, status: "already", existing: [{ name: "When to sell NVDA", enabled: true }], offer: null, zone }, true));
    expect(have).toContain("You already have an agent for this: When to sell NVDA.");
  });

  it("a card stored before the rule existed shows its preview and a link", () => {
    const { rule: _rule, drafts: _drafts, outlook: _outlook, ...old } = BASE;
    const markup = html(old as WatchCard, true);
    expect(text(markup)).toContain(BASE.preview.replace(/'/g, "'"));
    expect(markup).not.toMatch(/<button/);
    expect(markup).toMatch(/<a[^>]*href="\/agents\?q=[^"]+"[^>]*>Save this watch<\/a>/);
  });
});
