import type { Metadata } from "next";
import Link from "next/link";

import { AppPage, PageHead, Panel } from "@/components/oa/kit";
import { verifySubscriberToken } from "@/lib/email-subscribers";

export const metadata: Metadata = {
  title: "Stop the morning email",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = { searchParams?: Record<string, string | string[] | undefined> };

const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? "" : value ?? "");

const BUTTON =
  "inline-flex h-10 items-center justify-center rounded-[10px] px-4 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oa-ring";

/**
 * The stop link in every no-account morning email (backend/mail/subscribers.py). Like /email/unsubscribe, the page
 * only shows a button: the POST changes it, since link scanners open every URL in an email.
 */
export default function StopEmailPage({ searchParams }: Props) {
  const id = one(searchParams?.s);
  const token = one(searchParams?.t);
  const done = one(searchParams?.done);

  if (!verifySubscriberToken(id, "stop", token)) {
    return (
      <AppPage width="read">
        <PageHead full title="This link has expired or isn't complete" lede="Use the stop link in the newest email from us." />
      </AppPage>
    );
  }

  const hidden = (
    <>
      <input type="hidden" name="s" value={id} />
      <input type="hidden" name="t" value={token} />
      <input type="hidden" name="from" value="page" />
    </>
  );

  if (done === "off") {
    return (
      <AppPage width="read">
        <PageHead full title="You won't get the morning email anymore" />
        <Panel className="mt-6">
          <form method="post" action="/api/email/subscribe/stop" className="flex flex-wrap items-center justify-between gap-3">
            {hidden}
            <input type="hidden" name="action" value="resume" />
            <p className="text-[14px] text-oa-muted-fg">Changed your mind?</p>
            <button type="submit" className={`${BUTTON} border border-oa-border bg-oa-secondary text-oa-fg hover:bg-oa-accent`}>
              Send it again
            </button>
          </form>
        </Panel>
      </AppPage>
    );
  }

  if (done === "on") {
    return (
      <AppPage width="read">
        <PageHead full title="You'll get the morning email again" />
      </AppPage>
    );
  }

  return (
    <AppPage width="read">
      <PageHead full title="Stop the morning email?" />
      <Panel className="mt-6">
        <form method="post" action="/api/email/subscribe/stop" className="flex flex-wrap items-center gap-3">
          {hidden}
          <button type="submit" className={`${BUTTON} bg-oa-primary text-oa-primary-fg hover:opacity-95`}>
            Stop the morning email
          </button>
          <Link href="/news" className={`${BUTTON} text-oa-muted-fg hover:text-oa-fg`}>
            Keep it
          </Link>
        </form>
      </Panel>
    </AppPage>
  );
}
