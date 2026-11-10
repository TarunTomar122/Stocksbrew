"use client";

import { realisedCsv, type RealisedPiece } from "@/lib/portfolio-tax";

/** Downloads the year's realised gains as a CSV built in the browser from the rows on the page. */
export function ExportCsvButton({
  pieces,
  year,
}: {
  pieces: RealisedPiece[];
  year: number;
}) {
  const disabled = pieces.length === 0;
  return (
    <button
      type="button"
      disabled={disabled}
      title={
        disabled
          ? `No sells in ${year} to export`
          : `Download ${year} realised gains as CSV`
      }
      onClick={() => {
        const blob = new Blob([realisedCsv(pieces)], {
          type: "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `stocksbrew-realised-gains-${year}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
      className="inline-flex h-7 cursor-pointer items-center rounded border border-oa-border bg-oa-card px-2.5 text-[12.5px] font-medium text-oa-fg outline-none hover:border-oa-fg/30 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="hidden sm:inline">Export&nbsp;</span>CSV
    </button>
  );
}
