type Client = "claude" | "cursor" | "codex" | "hermes" | "openclaw";

const CLIENTS: Array<{ id: Client; label: string; detail: string }> = [
  { id: "claude", label: "Claude Code", detail: "MCP" },
  { id: "cursor", label: "Cursor", detail: "MCP" },
  { id: "codex", label: "Codex", detail: "MCP" },
  { id: "hermes", label: "Hermes", detail: "Remote MCP" },
  { id: "openclaw", label: "OpenClaw", detail: "Remote MCP" },
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

function HermesMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-full w-full text-[#7c3aed]">
      <path d="M5 18c3.5-8.8 10.5-8.8 14 0M7 8.5c1.6-3 8.4-3 10 0M12 5v14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function OpenClawMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-full w-full text-[#ef4444]">
      <path d="M6 6.5 10.5 11 8 20M18 6.5 13.5 11 16 20M8.5 14h7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClientMark({ client }: { client: Client }) {
  if (client === "claude") return <ClaudeMark />;
  if (client === "cursor") return <CursorMark />;
  if (client === "codex") return <CodexMark />;
  if (client === "hermes") return <HermesMark />;
  return <OpenClawMark />;
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

const CHANNELS = [
  { label: "Telegram", color: "#229ed9", path: "M20.6 4.1 17.8 19c-.2 1.1-.9 1.4-1.8.9l-4.3-3.2-2.1 2c-.2.2-.4.4-.8.4l.3-4.4 8-7.2c.3-.3-.1-.5-.5-.2l-9.9 6.2-4.2-1.3c-.9-.3-.9-.9.2-1.3l16.4-6.3c.8-.3 1.7.2 1.5 1.5Z" },
  { label: "WhatsApp", color: "#25d366", path: "M12 3a8.7 8.7 0 0 0-7.5 13.1L3.3 21l5-1.3A8.7 8.7 0 1 0 12 3Zm4.8 12.3c-.2.6-1.2 1.1-1.7 1.2-.5.1-1.2.2-3.8-.9-3.2-1.3-5.2-4.6-5.4-4.8-.1-.2-1.3-1.7-1.3-3.3 0-1.5.8-2.3 1.1-2.6.3-.3.6-.4.8-.4h.6c.2 0 .5-.1.7.5l1 2.4c.1.2.1.5 0 .7l-.5.7c-.2.2-.4.4-.2.8.2.3.8 1.3 1.8 2.1 1.2 1.1 2.2 1.4 2.6 1.6.3.2.5.1.7-.1l1-1.2c.2-.3.5-.3.8-.2l2.2 1c.4.2.6.3.7.5.1.1.1.8-.1 1.5Z" },
  { label: "Discord", color: "#5865f2", path: "M18.9 5.3A16 16 0 0 0 15 4l-.5 1a14 14 0 0 0-5 0L9 4a16 16 0 0 0-4 1.3C2.5 9 1.8 12.6 2.1 16.2A16 16 0 0 0 7 18.7l1.2-1.6-1.8-.9.4-.3c3.5 1.6 7.3 1.6 10.7 0l.5.3-1.8.9 1.2 1.6a16 16 0 0 0 4.8-2.5c.4-4.2-.7-7.8-3.3-10.9ZM8.7 14.2c-1 0-1.9-.9-1.9-2s.8-2 1.9-2 1.9.9 1.9 2-.9 2-1.9 2Zm6.6 0c-1 0-1.9-.9-1.9-2s.8-2 1.9-2 1.9.9 1.9 2-.9 2-1.9 2Z" },
] as const;

export function AgentChannelLogos({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} aria-label="Agent delivery channels">
      {CHANNELS.map((channel) => (
        <span key={channel.label} className="inline-flex items-center gap-2 rounded-xl border border-outline-variant bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-on-surface">
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" style={{ color: channel.color }}><path d={channel.path} fill="currentColor" /></svg>
          {channel.label}
        </span>
      ))}
    </div>
  );
}
