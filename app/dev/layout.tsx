export default function DevLayout({ children }: { children: React.ReactNode }) {
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
