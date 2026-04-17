"use client";

export type Pill = { id: string; label: string; count?: number };

type Props = {
  pills: Pill[];
  activeId: string;
  onSelect: (id: string) => void;
  size?: "sm" | "md";
};

export function PillRow({ pills, activeId, onSelect, size = "md" }: Props) {
  const padY = size === "sm" ? "py-1" : "py-1.5";
  const padX = size === "sm" ? "px-2" : "px-3";
  const text = size === "sm" ? "text-[10px]" : "text-[11px]";
  return (
    <div className="flex items-center gap-1 rounded-[8px] bg-[#0F1420] p-1">
      {pills.map((p) => {
        const active = p.id === activeId;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={`flex items-center gap-1.5 rounded-[6px] ${padX} ${padY} ${text} font-medium tracking-wide transition-colors ${
              active
                ? "bg-[#1A2130] text-[#F5F6F8]"
                : "text-[#8C94A8] hover:text-[#F5F6F8]"
            }`}
          >
            <span>{p.label}</span>
            {p.count !== undefined && (
              <span
                className={`font-mono tabular-nums ${
                  active ? "text-[#8C94A8]" : "text-[#555E75]"
                }`}
              >
                {p.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
