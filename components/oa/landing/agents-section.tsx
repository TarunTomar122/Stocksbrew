import { AGENT_TEMPLATES } from "@/lib/agent-jobs";

import { H2, LEDE } from "./shared";

const GROUP_LABEL: Record<string, string> = {
  Schedule: "On a schedule",
  Event: "When something is filed",
  Price: "When the price does something",
};

/**
 * Agents, shown as what they are: the real job templates, in the words a
 * person would use to ask for them. Nothing here trades.
 */
export function AgentsSection() {
  const groups = (["Schedule", "Event", "Price"] as const).map((group) => ({
    group,
    // One example of each kind; the full list is on the agents page.
    templates: AGENT_TEMPLATES.filter((template) => template.group === group).slice(0, 1),
  }));
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
      <div>
        <h2 className={H2}>Tell it what to watch. It emails you when it happens.</h2>
        <p className={LEDE}>
          Pick a price, a new filing or an earnings day on the stocks you care about. An agent checks every market day
          and writes to you only when it finds something. You can see what it would have sent over the last four weeks
          before you switch it on.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href="/agents"
            className="inline-flex h-11 items-center rounded-full border border-oa-border bg-oa-card px-5 text-base font-medium text-oa-fg transition-colors hover:border-oa-fg/30 active:translate-y-px"
          >
            Set up an agent
          </a>
          <span className="text-[14px] text-oa-muted-fg">It sends you a note. It never places a trade.</span>
        </div>
      </div>
      <div className="oa-surface grid grid-cols-1 overflow-hidden border border-oa-border bg-oa-card sm:grid-cols-3">
        {groups.map(({ group, templates }) => (
          <div key={group} className="-mb-px -mr-px border-b border-r border-oa-border p-4">
            <p className="oa-caption">{GROUP_LABEL[group]}</p>
            <ul className="mt-3 flex flex-col gap-3">
              {templates.map((template) => (
                <li key={template.id}>
                  <p className="text-[14.5px] font-medium leading-5 text-oa-fg">{template.title}</p>
                  <p className="mt-0.5 text-pretty text-[13px] leading-5 text-oa-muted-fg">{template.ask}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
