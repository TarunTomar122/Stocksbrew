const CLIENTS = [
  { label: "Claude Code", detail: "MCP", icon: "https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/anthropic/default.svg", invertInDark: true },
  { label: "Cursor", detail: "MCP", icon: "https://www.cursor.com/assets/images/logo.svg", invertInDark: false },
  { label: "Codex", detail: "MCP", icon: "https://upload.wikimedia.org/wikipedia/commons/6/66/OpenAI_logo_2025_%28symbol%29.svg", invertInDark: true },
  { label: "Hermes", detail: "Remote MCP", icon: "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/website/static/img/logo.png", invertInDark: false },
  { label: "OpenClaw", detail: "Remote MCP", icon: "https://raw.githubusercontent.com/openclaw/openclaw/main/apps/linux/src-tauri/icons/icon.svg", invertInDark: false },
] as const;

export function AgentClientLogos({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} aria-label="Compatible AI agent clients">
      {CLIENTS.map((client) => (
        <div
          key={client.label}
          className={`inline-flex items-center rounded-xl border border-outline-variant bg-surface ${compact ? "gap-2 px-2.5 py-1.5" : "gap-2.5 px-3 py-2"}`}
        >
          <span className={compact ? "h-4 w-4" : "h-5 w-5"}>
            <img src={client.icon} alt="" className={`h-full w-full object-contain ${client.invertInDark ? "dark:invert" : ""}`} />
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
