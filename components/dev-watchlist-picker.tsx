"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type UserSummary = {
  uid: string;
  email: string | null;
  display_name: string | null;
  photo_url: string | null;
  is_subscribed: boolean;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  subscribedAt: string | null;
  plan: "pro" | "free";
  created_at: string | null;
  last_sign_in_at: string | null;
  tracked_stocks_count: number;
};

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type PlanFilter = "all" | "pro" | "free";

const PLAN_TABS: { key: PlanFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pro", label: "Pro" },
  { key: "free", label: "Free" },
];

export function DevWatchlistPicker({ users, initialUserId }: { users: UserSummary[]; initialUserId: string }) {
  const router = useRouter();
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const planFiltered = planFilter === "all" ? users : users.filter((u) => u.plan === planFilter);
    if (!query.trim()) return planFiltered;
    const q = query.toLowerCase().trim();
    return planFiltered.filter(
      (u) =>
        (u.display_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.subscriptionPlan || "").toLowerCase().includes(q) ||
        (u.subscriptionStatus || "").toLowerCase().includes(q) ||
        String(u.tracked_stocks_count).includes(q),
    );
  }, [users, planFilter, query]);

  return (
    <div className="flex w-72 shrink-0 flex-col border-r border-[var(--oa-border)] bg-[#fafaf7]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--oa-border)] px-4 py-3">
        <span className="text-[11px] font-medium tracking-[0.12em] uppercase text-[var(--oa-muted-fg)]">
          Dev · Users
        </span>
        <span className="ml-auto rounded-full bg-[var(--oa-fg)] px-2 py-0.5 text-[10px] font-medium text-white tabular-nums">
          {filtered.length}
        </span>
      </div>

      {/* Plan filter pills */}
      <div className="flex gap-1 border-b border-[var(--oa-border)] px-3 py-2">
        {PLAN_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setPlanFilter(tab.key)}
            className={`flex-1 rounded-md py-1 text-[11px] font-medium transition-colors ${
              planFilter === tab.key
                ? "bg-[var(--oa-fg)] text-white"
                : "bg-[var(--oa-bg)] text-[var(--oa-muted-fg)] hover:bg-[var(--oa-border)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="border-b border-[var(--oa-border)] px-3 py-2">
        <div className="relative">
          <AnimatedIcon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-[var(--oa-muted-fg)]" />
          <input
            type="text"
            placeholder="Name, email, plan…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-full rounded-md border border-[var(--oa-border)] bg-oa-card pl-7 pr-2 text-[12px] text-[var(--oa-fg)] placeholder:text-[var(--oa-muted-fg)] outline-none focus:border-[var(--oa-fg)] transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--oa-muted-fg)] hover:text-[var(--oa-fg)]"
            >
              <AnimatedIcon name="close" size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="text-[13px] text-[var(--oa-muted-fg)]">
              {users.length === 0 ? "No users found" : "No matches"}
            </span>
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((user) => {
              const isSelected = initialUserId === user.uid;
              return (
                <button
                  key={user.uid}
                  onClick={() => router.push(`/dev/watchlist?userId=${user.uid}`)}
                  className={`flex items-start gap-3 border-b border-[var(--oa-bg)] px-4 py-3 text-left transition-colors hover:bg-[var(--oa-bg)] ${
                    isSelected ? "bg-oa-card shadow-[inset_3px_0_0_0_var(--oa-fg)]" : ""
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--oa-border)] text-[11px] font-medium text-[var(--oa-muted-fg)]">
                    {user.photo_url ? (
                      <img src={user.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (user.display_name || user.email || "?")[0].toUpperCase()
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-[#0a0a0a]">
                        {user.display_name || "Unknown"}
                      </span>
                      {user.plan === "pro" && (
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${
                          user.subscriptionPlan
                            ? "bg-[#ecfdf5] text-[#047857]"
                            : "bg-[#eff6ff] text-[#1e3a8a]"
                        }`}>
                          {user.subscriptionPlan || "pro"}
                        </span>
                      )}
                    </div>
                    {user.email && (
                      <span className="truncate text-[11px] text-[var(--oa-muted-fg)]">{user.email}</span>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-[var(--oa-muted-fg)]">
                      <span>{user.tracked_stocks_count} stocks</span>
                      {user.subscribedAt && <span>{formatRelative(user.subscribedAt)}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
