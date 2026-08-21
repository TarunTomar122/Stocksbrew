import { OaSiteHeader } from "@/components/oa/oa-site-header";
import type { Metadata } from "next";

import { McpConsent } from "@/components/mcp-consent";
import { getSessionUser } from "@/lib/auth-server";
import { OAuthRequestError, validateAuthorizationRequest } from "@/lib/agent-oauth";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const metadata: Metadata = { title: "Connect an agent", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Record<string, string | string[] | undefined> };

export default async function McpAuthorizePage({ searchParams }: Props) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }

  try {
    const validated = await validateAuthorizationRequest(params);
    const session = await getSessionUser();
    const user = session ? await getUserDoc(session.uid).catch(() => null) : null;
    const authorizationParams = Object.fromEntries(params.entries());
    return (
      <main className="oa-app flex min-h-[70vh] flex-grow items-center bg-oa-bg px-4 py-10">
        <div className="mx-auto w-full max-w-lg">
          <McpConsent
            clientName={validated.client.client_name}
            scopes={validated.scopes}
            authorizationParams={authorizationParams}
            signedIn={Boolean(session)}
            subscribed={resolveIsSubscribed(user)}
          />
        </div>
      </main>
    );
  } catch (error) {
    const message = error instanceof OAuthRequestError ? error.message : "This authorization request is invalid.";
    return (
      <main className="oa-app flex min-h-[70vh] flex-grow items-center bg-oa-bg px-4 py-10">
        <div className="mx-auto w-full max-w-lg rounded-2xl border border-oa-border bg-oa-card p-6">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-red-600">Connection failed</p>
          <h1 className="mt-2 text-xl font-extrabold text-oa-fg">Invalid agent request</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-oa-muted-fg">{message}</p>
        </div>
      </main>
    );
  }
}
