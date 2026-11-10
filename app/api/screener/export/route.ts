import { NextRequest, NextResponse } from "next/server";

import { can } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { getScreenerSnapshot } from "@/lib/screener";
import { FIELD_BY_ID, applyFilters, parseView, sortRows, type ScreenerRow } from "@/lib/screener-shared";

/** The current screen as a CSV. Pro only (`export_data`), and Pro sees zones on every stock; the numbers are raw, not formatted. */

export const dynamic = "force-dynamic";

function cell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = Array.isArray(value) ? value.join(" ") : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!can("export_data", viewer.plan)) {
    return NextResponse.json({ error: viewer.signedIn ? "pro_required" : "unauthenticated" }, { status: viewer.signedIn ? 403 : 401 });
  }
  const snapshot = await getScreenerSnapshot();
  if (!snapshot) return NextResponse.json({ error: "no_snapshot" }, { status: 503 });

  const view = parseView(req.nextUrl.searchParams);
  const rows = sortRows(applyFilters(snapshot.rows, view.filters), view.sort);
  const columns = ["symbol", "name", "sector", ...view.columns.filter((id) => id !== "spark" && id !== "sector")];
  const header = columns.map((id) => FIELD_BY_ID.get(id)?.short ?? id);
  const lines = [header.map(cell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((id) => cell((row as Record<string, unknown>)[id as keyof ScreenerRow])).join(","));
  }
  return new NextResponse(`${lines.join("\n")}\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="stocksbrew-screen-${snapshot.meta.as_of_day ?? "latest"}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
