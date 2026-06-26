import { getApp } from "firebase-admin/app";

type DispatchLane =
  | "tracked_news_prep"
  | "price_core_open"
  | "tracked_open_briefs"
  | "price_core_intraday"
  | "daily_postclose"
  | "open_anomalies"
  | "reddit_buzz"
  | "trump_logic"
  | "earnings_intel"
  | "market_events"
  | "data_health"
  | "zone_briefs"
  | "on_demand_news"
  | "stock_requests";

type TriggerDispatchOptions = {
  lane: DispatchLane;
  market?: "US" | "IN";
  limit?: number;
  extraArgs?: string[];
};

function cloudRunProject(): string {
  const project =
    process.env.GOOGLE_CLOUD_RUN_PROJECT?.trim() ||
    process.env.CLOUD_RUN_PROJECT?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    throw new Error("GOOGLE_CLOUD_RUN_PROJECT or GOOGLE_CLOUD_PROJECT missing");
  }
  return project;
}

async function accessToken(): Promise<string> {
  const app = getApp();
  const credential = app.options.credential as { getAccessToken?: () => Promise<{ access_token?: string }> };
  if (!credential?.getAccessToken) {
    throw new Error("Firebase admin credential cannot mint access token");
  }
  const tokenResp = await credential.getAccessToken();
  const token = tokenResp?.access_token;
  if (!token) {
    throw new Error("Google access token unavailable");
  }
  return token;
}

export async function triggerDispatchLane({
  lane,
  market = "US",
  limit,
  extraArgs = [],
}: TriggerDispatchOptions): Promise<void> {
  const project = cloudRunProject();
  const region = process.env.GOOGLE_CLOUD_REGION?.trim() || "us-central1";
  const dispatchJob = process.env.DISPATCH_JOB_NAME?.trim() || "tikrr-dispatch";
  const args = [
    "-m",
    "backend.cloudrun.orchestrator.dispatch",
    "--lane",
    lane,
    "--market",
    market,
    "--project",
    project,
    "--region",
    region,
  ];
  if (limit !== undefined) {
    args.push("--limit", String(limit));
  }
  args.push(...extraArgs);

  const resp = await fetch(
    `https://run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/${dispatchJob}:run`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        overrides: {
          containerOverrides: [{ args }],
        },
      }),
      cache: "no-store",
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`dispatch jobs.run failed (${resp.status}): ${text.slice(0, 400)}`);
  }
}
