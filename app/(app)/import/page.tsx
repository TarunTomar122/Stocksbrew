import type { Metadata } from "next";

import { ImportWorkspace } from "@/components/import/import-workspace";
import { AppPage, PageHead } from "@/components/oa/kit";
import { getSessionUser } from "@/lib/auth-server";
import { heldFromUserDoc } from "@/lib/import/merge";
import { getUserDoc } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bring your holdings in",
  description:
    "Upload the CSV your broker exports, paste your holdings or add a screenshot. Check every row, then see what your stocks are worth and what they made. Nothing connects to your broker.",
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
        title="Bring your holdings in"
        lede="Nothing is saved until you check every row."
      />
      <ImportWorkspace signedIn={Boolean(session)} held={heldFromUserDoc(doc as Record<string, unknown> | null)} />
    </AppPage>
  );
}
