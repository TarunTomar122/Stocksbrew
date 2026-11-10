import type { Metadata } from "next";
import Link from "next/link";

import { AppPage, PageHead, Panel } from "@/components/oa/kit";
import { EMAIL_CATEGORIES, isEmailCategory, verifyUnsubscribe } from "@/lib/email-unsubscribe";

export const metadata: Metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined> };

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const BUTTON =
  "inline-flex h-10 items-center justify-center rounded-[10px] px-4 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oa-ring";

export default async function EmailUnsubscribePage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const uid = one(params.u);
  const category = one(params.c);
  const token = one(params.t);
  const done = one(params.done);
  const valid = verifyUnsubscribe(uid, category, token);

  if (!valid || !isEmailCategory(category)) {
    return (
      <AppPage width="read">
        <PageHead
          full
          title="This link has expired or isn't complete"
          lede="Sign in and open your account to choose which emails you get. Every email also has its own stop link at the bottom."
        />
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/profile#notifications" className={`${BUTTON} bg-oa-primary text-oa-primary-fg hover:opacity-95`}>
            Open email settings
          </Link>
        </div>
      </AppPage>
    );
  }

  const cat = EMAIL_CATEGORIES[category];
  const hidden = (
    <>
      <input type="hidden" name="u" value={uid} />
      <input type="hidden" name="c" value={category} />
      <input type="hidden" name="t" value={token} />
      <input type="hidden" name="from" value="page" />
    </>
  );

  if (done === "off") {
    return (
      <AppPage width="read">
        <PageHead full title={`You won't get ${cat.label} anymore`} lede={`We've stopped ${cat.blurb}. Other emails you've kept on aren't affected.`} />
        <Panel className="mt-6">
          <form method="post" action="/api/email/unsubscribe" className="flex flex-wrap items-center justify-between gap-3">
            {hidden}
            <input type="hidden" name="action" value="resubscribe" />
            <p className="text-[14px] text-oa-muted-fg">Changed your mind?</p>
            <button type="submit" className={`${BUTTON} border border-oa-border bg-oa-secondary text-oa-fg hover:bg-oa-accent`}>
              Turn {cat.label} back on
            </button>
          </form>
        </Panel>
        <p className="mt-6 text-[14px] text-oa-muted-fg">
          To change the others, open <Link href="/profile#notifications" className="font-semibold text-oa-primary underline-offset-2 hover:underline">your account</Link>.
        </p>
      </AppPage>
    );
  }

  if (done === "on") {
    return (
      <AppPage width="read">
        <PageHead full title={`You'll get ${cat.label} again`} lede={`Turned back on: ${cat.blurb}.`} />
      </AppPage>
    );
  }

  return (
    <AppPage width="read">
      <PageHead full title={`Stop ${cat.label}?`} lede={`This turns off ${cat.blurb}. Your watchlist, alerts in the app and other emails stay as they are.`} />
      <Panel className="mt-6">
        <form method="post" action="/api/email/unsubscribe" className="flex flex-wrap items-center gap-3">
          {hidden}
          <button type="submit" className={`${BUTTON} bg-oa-primary text-oa-primary-fg hover:opacity-95`}>
            Stop {cat.label}
          </button>
          <Link href="/profile#notifications" className={`${BUTTON} text-oa-muted-fg hover:text-oa-fg`}>
            Choose in settings instead
          </Link>
        </form>
      </Panel>
    </AppPage>
  );
}
