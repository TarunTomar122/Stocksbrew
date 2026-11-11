import type { Metadata } from "next";

import { AgentConsentActions } from "@/components/account/agent-consent";
import { AppPage, PageHead, Panel, Tag } from "@/components/oa/kit";
import { normalizeAgentScopes } from "@/lib/agent-access-config";
import { OAuthRequestError, validateAuthorizationRequest } from "@/lib/agent-oauth";
import { getSessionUser } from "@/lib/auth-server";
import { SCOPE_INFO } from "@/lib/docs/developers";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import Link from "next/link";

export const metadata: Metadata = { title: "Connect an agent", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Record<string, string | string[] | undefined> };

/** The OAuth consent screen an MCP client sends a person to. The address is fixed by the OAuth metadata. */
export default async function McpAuthorizePage({ searchParams }: Props) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }

  let validated: Awaited<ReturnType<typeof validateAuthorizationRequest>>;
  try {
    validated = await validateAuthorizationRequest(params);
  } catch (error) {
    const message = error instanceof OAuthRequestError ? error.message : "This authorization request is invalid.";
    return (
      <AppPage width="read">
        <PageHead full crumb="Connection failed" title="This request cannot be approved" lede={message} />
        <Panel>
          <p className="text-pretty text-[15px] leading-6 text-oa-fg/90">
            Nothing was connected. Start again from your agent or client. If it keeps happening, the client is sending a request we do not accept: the details it needs are in the{" "}
            <Link prefetch={false} href="/developers#auth" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-2">
              developer docs
            </Link>
            .
          </p>
        </Panel>
      </AppPage>
    );
  }

  const session = await getSessionUser();
  const user = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const subscribed = resolveIsSubscribed(user);
  const scopes = normalizeAgentScopes(validated.scopes);
  const writes = scopes.some((scope) => SCOPE_INFO[scope].writes);

  return (
    <AppPage width="read">
      <PageHead
        full
        crumb="Connect an agent"
        title={`Let ${validated.client.client_name} use your stocksbrew account?`}
        lede="It will be able to do what is listed below, and nothing else. It cannot trade, pay, change your plan or delete your account."
      />
      <Panel label="It is asking to" right={writes ? <Tag tone="primary">includes changes</Tag> : <Tag>read only</Tag>} flush>
        <ul>
          {scopes.map((scope) => (
            <li key={scope} className="grid gap-x-4 gap-y-0.5 border-b border-oa-border px-4 py-2.5 last:border-b-0 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
              <span className="oa-mono pt-0.5 text-[12.5px] text-oa-muted-fg">
                {scope}
                {SCOPE_INFO[scope].writes ? <span className="ml-1.5 text-oa-primary">write</span> : null}
              </span>
              <span className="text-pretty text-[15px] leading-6 text-oa-fg">{SCOPE_INFO[scope].text}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <div className="mt-5 flex flex-col gap-4">
        <ul className="flex flex-col gap-1.5 text-[14.5px] leading-6 text-oa-fg/90">
          <li>Only approve a client you started yourself and trust.</li>
          <li>Access lasts until you stop using it for 30 days. Its calls count against your daily allowance.</li>
          {writes ? <li>A well-behaved agent asks before it adds a stock or sets an alert. You can undo either in the app.</li> : null}
          {!session ? <li>You need to sign in first.</li> : !subscribed ? <li>Connecting an agent is part of Pro.</li> : null}
        </ul>
        <AgentConsentActions authorizationParams={Object.fromEntries(params.entries())} signedIn={Boolean(session)} subscribed={subscribed} />
        <p className="text-[13.5px] leading-5 text-oa-muted-fg">
          Signed in as {session?.email ?? "nobody yet"}. Connected agents are listed under{" "}
          <Link prefetch={false} href="/profile#agent-access" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-2">
            Account
          </Link>
          .
        </p>
      </div>
    </AppPage>
  );
}
