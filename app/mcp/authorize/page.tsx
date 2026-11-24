import type { Metadata } from "next";

import { AgentConsentView } from "@/components/account/agent-consent-view";
import { AppPage, PageHead, Panel } from "@/components/oa/kit";
import { normalizeAgentScopes } from "@/lib/agent-access-config";
import { OAuthRequestError, validateAuthorizationRequest } from "@/lib/agent-oauth";
import { getSessionUser } from "@/lib/auth-server";
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

  return (
    <AgentConsentView
      clientName={validated.client.client_name}
      scopes={normalizeAgentScopes(validated.scopes)}
      signedIn={Boolean(session)}
      subscribed={subscribed}
      email={session?.email ?? null}
      authorizationParams={Object.fromEntries(params.entries())}
    />
  );
}
