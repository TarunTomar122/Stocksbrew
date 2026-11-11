import { AppPage, PageHead } from "@/components/oa/kit";

/** A report address that does not exist, a link that was turned off, or a stock we do not cover. */
export default function ResearchNotFound() {
  return (
    <AppPage width="read">
      <PageHead
        full
        crumb={<a href="/screener">Screener</a>}
        title="No research report at this address"
        lede="The report may belong to another account, or its shared link was turned off. Open the stock and run your own."
      />
    </AppPage>
  );
}
