import type { Metadata } from "next";
import { Suspense } from "react";

import { AskPageHint } from "@/components/ask/ask-page-hint";
import { EmptyInbox } from "@/components/inbox/inbox-empty";
import { InboxList } from "@/components/inbox/inbox-list";
import { InboxSkeleton } from "@/components/inbox/inbox-skeleton";
import { InboxSignIn } from "@/components/inbox/sign-in-prompt";
import { TheRead } from "@/components/oa/insight";
import { AppPage, PageHead } from "@/components/oa/kit";
import { getSessionUser } from "@/lib/auth-server";
import { getViewer } from "@/lib/entitlements-server";
import { forClient } from "@/lib/inbox/merge";
import { inboxRead } from "@/lib/inbox/read";
import { loadExampleInbox, loadUserInbox, readState } from "@/lib/inbox/server";
import { INBOX_KINDS, type InboxKind } from "@/lib/inbox/types";
import type { TheRead as TheReadData } from "@/lib/insights";
import { getUserDoc } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inbox",
  description: "What your agents found, how our calls on your stocks moved, and what the investors you follow traded, newest first.",
  alternates: { canonical: "/inbox" },
  // Someone's own inbox, or the example's: nothing for a search engine.
  robots: { index: false, follow: true },
};

function kindParam(value: string | string[] | undefined): InboxKind | null {
  const raw = typeof value === "string" ? value : "";
  if (raw === "insider") return "follow";
  return (INBOX_KINDS as readonly string[]).includes(raw) ? (raw as InboxKind) : null;
}

const EXAMPLE_TAG = (
  <span className="mr-2 inline-flex h-[20px] items-center rounded border border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_7%,transparent)] px-1.5 align-[2px] text-[12px] font-medium text-oa-primary">
    Example
  </span>
);

/**
 * The read, then the list. When the read has no cards of its own (every card would only repeat a row below), its
 * headline heads the list instead of standing alone in a card of its own.
 */
function ReadAndList({ read, label, children }: { read: TheReadData | null; label: string; children: (heading: string | null) => React.ReactNode }) {
  if (!read || read.insights.length > 0) {
    return (
      <>
        <TheRead read={read} label={label} askContext={false} />
        {children(null)}
      </>
    );
  }
  return <>{children(read.headline || null)}</>;
}

async function ExampleInbox({ kind }: { kind: InboxKind | null }) {
  const inbox = await loadExampleInbox();
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="oa-surface flex flex-wrap items-center justify-between gap-3 border border-oa-border bg-oa-card px-4 py-3">
        <p className="min-w-0 basis-full text-pretty text-[14px] leading-5 text-oa-fg sm:basis-0 sm:flex-1">
          {EXAMPLE_TAG}
          This is the example portfolio&apos;s inbox. Sign in and yours fills with your own agents, the calls on your stocks and the investors you follow.
        </p>
        <InboxSignIn />
      </div>
      {inbox.items.length === 0 ? (
        <EmptyInbox example unavailable={inbox.missing.length > 0} />
      ) : (
        <>
          <ReadAndList read={inboxRead(inbox.items, null, true)} label="The example's inbox">
            {(heading) => <InboxList items={inbox.items.map(forClient)} seenAt={null} today={inbox.today} example initialKind={kind} heading={heading} />}
          </ReadAndList>
          {/* No Ask box on the page: the shell's Ask opens on the example's stocks (owner rule 1). */}
          <AskPageHint context="ex.portfolio" />
        </>
      )}
    </div>
  );
}

async function UserInbox({ uid, kind }: { uid: string; kind: InboxKind | null }) {
  // Without the user doc there are no stocks, follows or read mark to go on: say the inbox could not be read.
  const [doc, viewer] = await Promise.all([getUserDoc(uid).catch(() => undefined), getViewer()]);
  if (doc === undefined) return <EmptyInbox unavailable />;
  const inbox = await loadUserInbox(viewer, doc);
  if (inbox.items.length === 0) return <EmptyInbox unavailable={inbox.missing.length > 0} />;
  const { seenAt } = readState(inbox.items, doc);
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <ReadAndList read={inboxRead(inbox.items, seenAt, false)} label="Your inbox">
        {(heading) => <InboxList items={inbox.items.map(forClient)} seenAt={seenAt} today={inbox.today} example={false} initialKind={kind} heading={heading} account={uid} />}
      </ReadAndList>
      {/* No Ask box on the page: the shell's Ask opens on the person's stocks (owner rule 1). */}
      <AskPageHint context="portfolio" />
    </div>
  );
}

async function InboxBody({ kind }: { kind: InboxKind | null }) {
  const session = await getSessionUser().catch(() => null);
  return session ? <UserInbox uid={session.uid} kind={kind} /> : <ExampleInbox kind={kind} />;
}

export default function InboxPage({ searchParams }: { searchParams?: { kind?: string | string[] } }) {
  const kind = kindParam(searchParams?.kind);
  return (
    <AppPage width="wide" className="max-w-[68rem]">
      <PageHead title="Inbox" />
      <Suspense fallback={<InboxSkeleton />}>
        <InboxBody kind={kind} />
      </Suspense>
    </AppPage>
  );
}
