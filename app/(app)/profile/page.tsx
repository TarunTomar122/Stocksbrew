import { loadAccountData, sampleAccountData } from "@/app/(app)/profile/account-data";
import { SignInPanel } from "@/components/account/account-controls";
import { AccountView } from "@/components/account/account-view";
import { AppPage, PageHead, Panel } from "@/components/oa/kit";
import { publicAppUrl } from "@/lib/agent-access-config";
import { getSessionUser } from "@/lib/auth-server";
import Link from "next/link";

export const revalidate = 0;

type Props = { searchParams?: Record<string, string | string[] | undefined> };

/**
 * Account: plan and billing, emails, agents and API tokens, what you follow,
 * and your data. Old links to /profile#agent-access still land on the tokens
 * section (id="agent-access").
 */
export default async function AccountPage({ searchParams }: Props) {
  const session = await getSessionUser();
  const mcpUrl = `${publicAppUrl()}/api/mcp`;

  if (session) {
    return <AccountView data={await loadAccountData(session, mcpUrl)} />;
  }

  // Development only: look at the page with sample data, without signing in.
  const preview = typeof searchParams?.preview === "string" ? searchParams.preview : null;
  if (process.env.NODE_ENV !== "production" && (preview === "free" || preview === "pro")) {
    return <AccountView data={sampleAccountData(preview, mcpUrl)} />;
  }

  return (
    <AppPage width="read">
      <PageHead full title="Sign in to see your account" lede="Your plan, your emails, your agents and tokens, and your data live here once you are signed in." />
      <Panel>
        <div className="flex flex-col gap-4">
          <p className="text-pretty text-[15.5px] leading-7 text-oa-fg/90">
            Sign-in is with Google only. We receive your name, email address and profile picture, and nothing else from your Google account. There is no password to set and no
            brokerage to connect.
          </p>
          <SignInPanel />
          <p className="text-[13.5px] leading-5 text-oa-muted-fg">
            What we store and how to delete it is on{" "}
            <Link prefetch={false} href="/security" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-2">
              Security
            </Link>
            . You can read stock reports, the wire and the docs without an account.
          </p>
        </div>
      </Panel>
    </AppPage>
  );
}
