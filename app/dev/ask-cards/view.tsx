"use client";

import { AskCardView } from "@/components/ask/cards";
import type { AskCard } from "@/lib/ask-cards";

/** The cards as Ask draws them, with inert actions: a local preview only. */
export function CardsPreview({ cards, signedIn }: { cards: AskCard[]; signedIn: boolean }) {
  const actions = { signedIn, ask: () => undefined, signIn: () => undefined };
  return (
    <div className="flex flex-col gap-4">
      {cards.map((card, index) => (
        <AskCardView key={index} card={card} actions={actions} />
      ))}
    </div>
  );
}
