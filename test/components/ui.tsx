import Link from "next/link";
import { ReactNode } from "react";

import { pretty } from "@/lib/data";

type ShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function AppShell({ title, subtitle, children }: ShellProps) {
  return (
    <main className="page-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Tikrr Test</p>
          <h1>{title}</h1>
          {subtitle ? <p className="subtitle">{subtitle}</p> : null}
        </div>
      </header>

      <nav className="nav-grid">
        <Link href="/">Dashboard</Link>
        <Link href="/market">Market</Link>
        <Link href="/views">Views</Link>
        <Link href="/stocks">Stocks</Link>
        <Link href="/sectors">Sectors</Link>
        <Link href="/instruments">Instruments</Link>
        <Link href="/news">News</Link>
        <Link href="/search">Search</Link>
      </nav>

      <form action="/search" method="get" className="search-bar">
        <input type="text" name="q" placeholder="Search symbol, name, sector..." />
        <button type="submit">Search</button>
      </form>

      {children}
    </main>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function JsonDetails({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="raw-box">
      <summary>{label}</summary>
      <pre>{pretty(value)}</pre>
    </details>
  );
}

export function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={`stat-card ${tone || ""}`.trim()}>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}
