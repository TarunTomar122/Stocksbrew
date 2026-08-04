"use client";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  status?: "loading" | "success" | "error";
};

export function RadarAsyncModal({ open, title, subtitle, status = "loading" }: Props) {
  if (!open) return null;
  const isLoading = status === "loading";
  const isSuccess = status === "success";
  const isError = status === "error";
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#111827]/35 backdrop-blur-[1px]">
      <div className={`w-[min(92vw,420px)] rounded-2xl bg-white px-5 py-5 shadow-[0_24px_48px_rgba(17,24,39,0.22)] ${
        isError ? "border border-[#fecaca]" : isSuccess ? "border border-[#bbf7d0]" : "border border-[#dbeafe]"
      }`}>
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            isError ? "bg-[#fef2f2] text-[#b91c1c]" : isSuccess ? "bg-[#ecfdf5] text-[#047857]" : "bg-[#eff6ff] text-[#1d4ed8]"
          }`}>
            {isLoading ? (
              <span className="h-4 w-4 rounded-full border-2 border-[#93c5fd] border-t-[#1d4ed8] animate-spin" />
            ) : isSuccess ? (
              <span className="text-[15px]">✓</span>
            ) : (
              <span className="text-[15px]">!</span>
            )}
          </span>
          <div className="flex min-w-0 flex-col">
            <p className="text-[14px] font-semibold text-[#0f172a]">{title}</p>
            <p className="text-[12px] text-[#475569]">
              {subtitle || (isError ? "Could not apply this update." : isSuccess ? "Update applied." : "Saving your Watchlist and refreshing the research...")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
