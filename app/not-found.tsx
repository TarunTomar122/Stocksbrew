import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center px-6 py-20">
      <p className="oa-mono text-xs uppercase tracking-[0.14em] text-oa-muted-fg">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-oa-fg">Page not found</h1>
      <p className="mt-3 text-base leading-relaxed text-oa-muted-fg">
        That Stocksbrew URL does not exist. Start with the sitemap, agent index, or developer docs.
      </p>
      <pre className="mt-6 overflow-x-auto rounded-xl border border-oa-border bg-oa-bg p-4 text-sm leading-relaxed text-oa-fg">{`- [Sitemap](/sitemap.xml)
- [Agent index](/llms.txt)
- [Agent docs](/agents)
- [Developer reference](/developers)`}</pre>
      <Link href="/" className="mt-6 text-sm font-medium text-oa-primary hover:underline">
        Return to Stocksbrew
      </Link>
    </main>
  );
}
