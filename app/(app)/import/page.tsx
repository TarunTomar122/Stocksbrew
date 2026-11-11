import type { Metadata } from "next";

import { ImportWorkspace } from "@/components/import/import-workspace";
import { AppPage, PageHead } from "@/components/oa/kit";
import { getSessionUser } from "@/lib/auth-server";
import { heldFromUserDoc } from "@/lib/import/merge";
import { getUserDoc } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "What we think of your stocks",
  description:
    "Paste your tickers or a screenshot of your broker app and see our call on each stock, where your money sits by sector, today's move and who reports earnings soon. No account needed.",
  alternates: { canonical: "/import" },
  // Kept out of search until the owner has reviewed it.
  robots: { index: false, follow: true },
};

export default async function ImportPage() {
  const session = await getSessionUser().catch(() => null);
  // Signed in: what they already track, so the list can say which stocks they own already.
  const doc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  return (
    <AppPage width="read" prose={false}>
      <PageHead
        full
        title="See what we think of your stocks"
        lede="Paste your tickers or a screenshot of your broker app. You get our call on each stock, where your money sits and who reports soon, in a few seconds and without an account."
      />
      <ImportWorkspace signedIn={Boolean(session)} held={heldFromUserDoc(doc as Record<string, unknown> | null)} />
    </AppPage>
  );
}
