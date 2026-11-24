import Link from "next/link";

import { AgentConsentActions } from "@/components/account/agent-consent";
import { AppPage, PageHead, Panel, Tag } from "@/components/oa/kit";
import { AGENT_FREE_DAILY_CALL_LIMIT, type AgentScope } from "@/lib/agent-access-config";
import { FREE_AGENT_TOOLS } from "@/lib/agent-tiers";
import { SCOPE_INFO } from "@/lib/docs/developers";

const LINK = "font-medium text-oa-fg underline decoration-oa-border underline-offset-2";

/**
 * The OAuth consent screen itself, from plain values: app/mcp/authorize/page.tsx reads the request, the session and
 * the plan and renders this. Kept apart so the screen can be looked at without a registered client.
 */
export function AgentConsentView({
  clientName,
  scopes,
  signedIn,
  subscribed,
  email,
  authorizationParams,
}: {
  clientName: string;
  scopes: AgentScope[];
  signedIn: boolean;
  subscribed: boolean;
  email: string | null;
  authorizationParams: Record<string, string>;
}) {
  const writes = scopes.some((scope) => SCOPE_INFO[scope].writes);
  return (
    <AppPage width="read">
      <PageHead
        full
        crumb="Connect an agent"
        title={`Let ${clientName} use your stocksbrew account?`}
        lede="It cannot trade, pay, change your plan or delete your account."
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
          {!signedIn ? (
            <li>You need to sign in first.</li>
          ) : !subscribed ? (
            <li>
              On Free your agent gets {FREE_AGENT_TOOLS.length} tools and {AGENT_FREE_DAILY_CALL_LIMIT} calls a day.{" "}
              <Link prefetch={false} href="/developers#plans" className={LINK}>
                What Pro adds
              </Link>
            </li>
          ) : null}
        </ul>
        <AgentConsentActions authorizationParams={authorizationParams} signedIn={signedIn} />
        <p className="text-[13.5px] leading-5 text-oa-muted-fg">
          Signed in as {email ?? "nobody yet"}. Connected agents are listed under{" "}
          <Link prefetch={false} href="/profile#agent-access" className={LINK}>
            Account
          </Link>
          .
        </p>
      </div>
    </AppPage>
  );
}
