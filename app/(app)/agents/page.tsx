import type { Metadata } from "next";

import AgentJobsPage from "./jobs/page";
import { ogImage } from "@/lib/og/url";

/**
 * /agents is the standing jobs surface. The developer material that used to
 * live here (API, MCP server, CLI) is at /developers.
 */
export const dynamic = "force-dynamic";

const SHARE_IMAGE = ogImage(["page", "agents"], "stocksbrew agents: standing jobs that watch your stocks");

export const metadata: Metadata = {
  title: "Stock Agents: Jobs That Watch a Schedule, an Event or a Price",
  description:
    "Agents that watch your stocks on a schedule, on an event or on a price, and report back in one line: what happened and whether it needs you. Replay one on the last four weeks before you switch it on.",
  alternates: { canonical: "/agents" },
  openGraph: { title: "Stock Agents: Jobs That Watch a Schedule, an Event or a Price · stocksbrew", url: "https://www.stocksbrew.online/agents", images: [SHARE_IMAGE] },
  twitter: { card: "summary_large_image", images: [SHARE_IMAGE] },
};

export default AgentJobsPage;
