import type { Metadata } from "next";
import Link from "next/link";

import { AppPage, PageHead } from "@/components/oa/kit";
import { ConfirmSubscription } from "@/components/email-confirm";
import { verifySubscriberToken } from "@/lib/email-subscribers";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = { searchParams?: Record<string, string | string[] | undefined> };

const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? "" : value ?? "");

/**
 * The link in the morning email's confirmation (lib/emails/subscriber-confirm.ts). The page checks the signature,
 * then the browser confirms with a POST: a GET never changes anything, since link scanners open every URL in an email.
 */
export default function ConfirmEmailPage({ searchParams }: Props) {
  const id = one(searchParams?.s);
  const token = one(searchParams?.t);
  if (!verifySubscriberToken(id, "confirm", token)) {
    return (
      <AppPage width="read">
        <PageHead full title="This link has expired or isn't complete" lede="Open the newest email from us, or sign up again on any stock page." />
        <Link href="/news" className="mt-4 inline-block text-[14px] font-semibold text-oa-primary underline-offset-2 hover:underline">
          Open today&apos;s news
        </Link>
      </AppPage>
    );
  }
  return (
    <AppPage width="read">
      <ConfirmSubscription id={id} token={token} />
    </AppPage>
  );
}
