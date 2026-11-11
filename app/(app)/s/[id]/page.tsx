import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppPage } from "@/components/oa/kit";
import { DeleteShare } from "@/components/share/delete-share";
import { ShareCardView } from "@/components/share/share-card";
import { getSessionUser } from "@/lib/auth-server";
import { OG_HEIGHT, OG_SITE_URL, OG_WIDTH } from "@/lib/og/url";
import { isShareOwner, readShare } from "@/lib/share/store";
import { SHARE_CTA, isShareId, type ShareKind } from "@/lib/share/types";

/**
 * A card someone shared from their portfolio: the snapshot, a short line on
 * what stocksbrew is, and one way in. Never indexed. The owner sees a delete
 * button; nobody else learns who made it.
 */

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const NOINDEX = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } };

const WHAT: Record<ShareKind, string> = {
  portfolio: "stocksbrew reads the stocks you own and tells you what they add up to: how concentrated you are, which sectors you lean on, and how much your portfolio swings next to the S&P 500.",
  xray: "stocksbrew opens up the funds you own and adds what is inside them to the stocks you bought, from each fund's own SEC filing, so you see what you really own.",
  dividends: "stocksbrew plans the dividends your stocks should pay over the next twelve months, month by month, with announced payments kept apart from estimates.",
  stress: "stocksbrew replays real market shocks of the last decade on the stocks you hold today, next to the S&P 500. It is history, not a forecast.",
  memo: "stocksbrew writes a short memo on your portfolio every week: how it did against the S&P 500, what changed in your stocks and what is worth a look.",
};

function dayWords(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const share = isShareId(params.id) ? await readShare(params.id).catch(() => null) : null;
  if (!share) return { title: "Card not found", robots: NOINDEX };
  const path = `/s/${share.id}`;
  const title = share.card.topic;
  const description = share.card.headline;
  const image = { url: `${OG_SITE_URL}/api/og/share/${share.id}`, width: OG_WIDTH, height: OG_HEIGHT, alt: share.card.headline, type: "image/png" };
  return {
    title,
    description,
    robots: NOINDEX,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "stocksbrew", title, description, url: `${OG_SITE_URL}${path}`, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function SharePage({ params }: Params) {
  const share = isShareId(params.id) ? await readShare(params.id).catch(() => null) : null;
  // Deleted or never made: a real 404, so the old link stops counting as a page.
  if (!share) notFound();

  const session = await getSessionUser().catch(() => null);
  const owner = session ? await isShareOwner(share.id, session.uid).catch(() => false) : false;
  const cta = SHARE_CTA[share.card.kind];
  const day = dayWords(share.createdAt);

  return (
    <AppPage width="read">
      <div className="flex flex-col gap-5 pt-1">
        <p className="px-2 text-[13.5px] leading-5 text-oa-muted-fg sm:px-0">
          Someone shared this from their stocksbrew portfolio{day ? ` on ${day}` : ""}. It is a snapshot from that day and does not update.
        </p>
        <ShareCardView card={share.card} path={`/s/${share.id}`} />
        {owner ? <DeleteShare id={share.id} /> : null}
        <section className="flex flex-col gap-3 rounded-xl border border-oa-border bg-oa-card px-4 py-4 sm:px-5">
          <h1 className="text-[18px] font-semibold leading-6 text-oa-fg">See this for your own stocks</h1>
          <p className="text-pretty text-[14.5px] leading-[22px] text-oa-muted-fg">{WHAT[share.card.kind]}</p>
          <p className="text-pretty text-[14.5px] leading-[22px] text-oa-muted-fg">
            Start with the example portfolio, then sign in and add your holdings. It is free, and nothing connects to your broker.
          </p>
          <div>
            <Link
              href={cta.href}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-oa-primary px-4 text-[14px] font-medium text-oa-primary-fg hover:opacity-90"
            >
              See this for your own stocks
            </Link>
          </div>
        </section>
      </div>
    </AppPage>
  );
}
