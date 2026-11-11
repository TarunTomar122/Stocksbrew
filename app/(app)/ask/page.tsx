import type { Metadata } from "next";

import { AskWorkspace } from "@/components/ask/ask-workspace";
import { AppPage } from "@/components/oa/kit";
import type { AskUIMessage } from "@/lib/ask-cards";
import { ASK_MAX_QUESTION_CHARS } from "@/lib/ask-config";
import { formatAskContext, parseAskContext } from "@/lib/ask-context";
import { ASK_HANDOFF_PARAM, ASK_HANDOFF_VALUE } from "@/lib/ask-handoff";
import { askUsageStore, getConversation, listConversations } from "@/lib/ask-data";
import { askPlanFor, peekAskQuota } from "@/lib/ask-limits";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { ogImage } from "@/lib/og/url";

export const dynamic = "force-dynamic";

const SHARE_IMAGE = ogImage(["page", "ask"], "Ask stocksbrew about any US stock");

export const metadata: Metadata = {
  title: "Ask a Question About Any US Stock",
  description:
    "Ask about any US stock, test an investing idea or check your portfolio. The copilot looks things up first: every figure comes with its source and time.",
  alternates: { canonical: "/ask" },
  openGraph: {
    title: "Ask a Question About Any US Stock · stocksbrew",
    description: "A research copilot for US stocks. Sourced answers, backtests in the conversation, ideas turned into baskets.",
    url: "https://www.stocksbrew.online/ask",
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [SHARE_IMAGE] },
};

function first(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

export default async function AskPage({ searchParams }: { searchParams: { q?: string | string[]; c?: string | string[]; ctx?: string | string[]; from?: string | string[] } }) {
  const session = await getSessionUser();
  const question = first(searchParams.q)?.slice(0, ASK_MAX_QUESTION_CHARS) ?? null;
  // Shape only: the item itself is read when the question is sent, so opening the page adds no read.
  const linked = parseAskContext(first(searchParams.ctx));
  const conversationId = first(searchParams.c);
  // "Open full screen" in the Ask panel: the conversation comes from this tab's storage, not the server.
  const handoff = first(searchParams[ASK_HANDOFF_PARAM]) === ASK_HANDOFF_VALUE && !question && !conversationId;

  const [doc, conversations, conversation] = session
    ? await Promise.all([
        getUserDoc(session.uid).catch(() => null),
        listConversations(session.uid),
        conversationId ? getConversation(session.uid, conversationId) : Promise.resolve(null),
      ])
    : [null, [], null];
  const plan = askPlanFor({ uid: session?.uid ?? null, isPro: resolveIsSubscribed(doc) });

  // Signed-out people are counted by address in the route; the page does not know it, so it shows no count until they ask.
  const quota = session ? await peekAskQuota(askUsageStore, { key: session.uid, plan }).catch(() => null) : null;

  return (
    <AppPage width="wide" prose>
      {/* The site-wide market status pill is fixed to the bottom centre, exactly where the composer sits.
          It has no route check for /ask yet (components/market-status.tsx lifts it only on /watchlist), so this
          page hides it. Remove this once the pill skips /ask itself. */}
      <style dangerouslySetInnerHTML={{ __html: "div.fixed:has(> .t-acc > #market-status-panel){display:none}" }} />
      <AskWorkspace
        signedIn={Boolean(session)}
        plan={plan}
        initialQuestion={question}
        initialContext={linked ? formatAskContext(linked) : null}
        initialConversation={conversation ? { id: conversation.id, items: conversation.items as AskUIMessage[] } : null}
        initialConversations={conversations}
        initialAllowance={quota ? { limit: quota.limit, remaining: quota.remaining } : null}
        handoff={handoff}
      />
    </AppPage>
  );
}
