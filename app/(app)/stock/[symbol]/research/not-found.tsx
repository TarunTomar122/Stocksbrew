import { AppPage, PageHead } from "@/components/oa/kit";

/** A report address that does not exist, a link that was turned off, or a stock we do not cover. */
export default function ResearchNotFound() {
  return (
    <AppPage width="read">
      <PageHead
        full
        crumb={<a href="/screener">Screener</a>}
        title="No research report at this address"
        lede="It may be private, or its share link was turned off. Run your own."
      />
    </AppPage>
  );
}
