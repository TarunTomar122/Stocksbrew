import type { Metadata } from "next";

import AgentJobsPage from "./jobs/page";
import { JsonLd } from "@/components/docs/json-ld";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";

/**
 * /agents is the standing jobs surface. The developer material that used to
 * live here (API, MCP server, CLI) is at /developers.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = toolPageMetadata("/agents");

export default function AgentsPage(props: Parameters<typeof AgentJobsPage>[0]) {
  return (
    <>
      <JsonLd data={toolPageLd("/agents")} />
      <AgentJobsPage {...props} />
    </>
  );
}
