import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { newYorkToday } from "@/lib/portfolio-data";
import { conditionInputsFor } from "@/lib/thesis-watch/condition-data";
import { availableMetrics, METRICS, nyDay, prefill, shortDay, type ConditionMetric, type ConditionOp, type ReportRef } from "@/lib/thesis-watch/conditions";

/**
 * GET /api/thesis/conditions?id=US_AMD: the figures a measurable condition can be set on for one stock, each with its
 * value now and a first number for each operator, so the reasons sheet's "Holds if…" picker can prefill a line and
 * show where the stock is. Only metrics with a stored figure come back. Signed in only; reads public stored figures,
 * writes nothing.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^US_[A-Z0-9_]{1,12}$/;

export type MetricOption = {
  metric: ConditionMetric;
  now: number;
  /** "Nov 3": the figure's own day. */
  asOf: string;
  source: string;
  prefill: Partial<Record<ConditionOp, number>>;
};

export type ConditionMenu = { metrics: MetricOption[]; report: ReportRef | null };

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim().toUpperCase();
  if (!ID.test(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  let inputs;
  try {
    inputs = (await conditionInputsFor([id], newYorkToday(new Date()))).get(id) ?? null;
  } catch {
    return NextResponse.json({ error: "read_failed" }, { status: 503 });
  }
  const metrics: MetricOption[] = availableMetrics(inputs).map((metric) => {
    const figure = inputs!.values[metric]!;
    const now = metric === "dividend" && figure.stoppedSince ? 0 : figure.value;
    return {
      metric,
      now,
      asOf: shortDay(nyDay(figure.asOf)),
      source: figure.source,
      prefill: Object.fromEntries(METRICS[metric].ops.map((op) => [op, prefill(metric, op, figure.value)])),
    };
  });
  const body: ConditionMenu = { metrics, report: inputs?.report ?? null };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
