import { notFound } from "next/navigation";

export default function DevLayout({ children }: { children: React.ReactNode }) {
  // Local-only tools. In production every /dev address is a real 404 (status and page), decided here before any
  // page or loading boundary can start streaming a 200.
  if (process.env.NODE_ENV === "production") notFound();
  // Full-viewport overlay that covers the root layout's header & footer.
  // Dev-only - gives clean full-bleed screenshots without restructuring the app.
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#f6f7f9",
        overflow: "auto",
      }}
    >
      {children}
    </div>
  );
}
