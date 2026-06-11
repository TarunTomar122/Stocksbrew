import { resolveSectorIcon } from "@/lib/sector-icon";

export function SectorIconBadge({
  label,
  size = 32,
  iconSize = 16,
}: {
  label: string;
  size?: number;
  iconSize?: number;
}) {
  const theme = resolveSectorIcon(label);

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: theme.bg,
        color: theme.fg,
      }}
      aria-hidden
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: iconSize, fontVariationSettings: "'wght' 500" }}
      >
        {theme.icon}
      </span>
    </div>
  );
}
