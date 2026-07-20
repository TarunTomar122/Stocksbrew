type Client = "claude" | "cursor" | "codex" | "mcp";

const CLIENTS: Array<{ id: Client; label: string; detail: string }> = [
  { id: "claude", label: "Claude Code", detail: "MCP" },
  { id: "cursor", label: "Cursor", detail: "MCP" },
  { id: "codex", label: "Codex", detail: "MCP" },
  { id: "mcp", label: "Your agent", detail: "MCP or API" },
];

function ClaudeMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-full w-full text-[#d97757]">
      <path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9 4.9 19.1M7.8 2.9l8.4 18.2M21.1 7.8 2.9 16.2M16.2 2.9 7.8 21.1M2.9 7.8l18.2 8.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CursorMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-full w-full text-on-surface">
      <path d="m12 2.8 8 4.6v9.2l-8 4.6-8-4.6V7.4l8-4.6Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m4.3 7.6 7.7 4.5 7.7-4.5M12 12.1v8.7M8 5.1l8 4.6v4.6l-8-4.6V5.1Z" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

function CodexMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-full w-full text-on-surface">
      <g fill="none" stroke="currentColor" strokeWidth="1.45">
        <path d="M12 3.2a4.2 4.2 0 0 1 4 2.9 4.2 4.2 0 0 1 4.5 2.1 4.2 4.2 0 0 1-.5 4.9 4.2 4.2 0 0 1-1.6 4.7 4.2 4.2 0 0 1-4.9.7 4.2 4.2 0 0 1-4.8.2 4.2 4.2 0 0 1-2.1-4.4 4.2 4.2 0 0 1-2.5-4.2 4.2 4.2 0 0 1 3.6-3.4A4.2 4.2 0 0 1 12 3.2Z" />
        <path d="m8 6.8 7.8 4.5v6M16 6.2 8.2 10.7v6.1M6.7 11.7l5.3 3 5.3-3" />
      </g>
    </svg>
  );
}

function McpMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-full w-full text-landing-brand">
      <path d="M8.5 5.5 3.5 12l5 6.5M15.5 5.5l5 6.5-5 6.5M13.5 3.5l-3 17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClientMark({ client }: { client: Client }) {
  if (client === "claude") return <ClaudeMark />;
  if (client === "cursor") return <CursorMark />;
  if (client === "codex") return <CodexMark />;
  return <McpMark />;
}

export function AgentClientLogos({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} aria-label="Compatible AI agent clients">
      {CLIENTS.map((client) => (
        <div
          key={client.id}
          className={`inline-flex items-center rounded-xl border border-outline-variant bg-surface ${compact ? "gap-2 px-2.5 py-1.5" : "gap-2.5 px-3 py-2"}`}
        >
          <span className={compact ? "h-4 w-4" : "h-5 w-5"}>
            <ClientMark client={client.id} />
          </span>
          <span className="text-left">
            <span className={`block font-semibold leading-none text-on-surface ${compact ? "text-[11px]" : "text-[12px]"}`}>{client.label}</span>
            {!compact ? <span className="mt-1 block font-mono text-[8px] uppercase tracking-[0.08em] text-on-surface-variant">{client.detail}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}
