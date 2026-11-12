import { AppChrome } from "@/components/oa/app-chrome";
import { interTight } from "@/components/oa/font";
import { AppPage, PageHead, Panel } from "@/components/oa/kit";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";

const PLACES: Array<{ href: string; label: string; what: string }> = [
  { href: "/briefing", label: "Briefing", what: "What moved today and what needs you" },
  { href: "/explore", label: "Explore", what: "The research desk: news, screener, calendar, markets" },
  { href: "/ask", label: "Ask", what: "A sourced answer about a stock or an idea" },
  { href: "/follow", label: "Follow", what: "What funds, Congress and insiders filed" },
  { href: "/docs", label: "Docs", what: "How each part works" },
];

/**
 * The 404. People get the five places most likely to be what they wanted;
 * programs get the same pointers as plain links in a list they can parse.
 */
export default function NotFound() {
  return (
    <>
      {/* The 404 sits outside the app layout, so it brings the chrome itself. */}
      <div className={`oa-app ${interTight.variable}`}>
        <AppChrome />
      </div>
      <AppPage width="read">
      <PageHead
        full
        crumb="404"
        title="There is no page at this address"
        lede="The link may be wrong. Search a ticker with ⌘K, or start below."
      />
      <Panel flush>
        <ul>
          {PLACES.map((place) => (
            <li key={place.href} className="border-b border-oa-border last:border-b-0">
              <AppLink href={place.href} className="group flex items-center gap-4 px-4 py-3 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium leading-[22px] text-oa-fg">{place.label}</span>
                  <span className="mt-0.5 block text-pretty text-[14px] leading-[20px] text-oa-muted-fg">{place.what}</span>
                </span>
              </AppLink>
            </li>
          ))}
        </ul>
      </Panel>
      <p className="mb-16 mt-4 text-[13px] leading-5 text-oa-muted-fg">
        For programs:{" "}
        <a href="/sitemap.xml" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
          sitemap.xml
        </a>
        {" · "}
        <a href="/llms.txt" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
          llms.txt
        </a>
        {" · "}
        <Link prefetch={false} href="/developers" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
          developers
        </Link>
      </p>
    </AppPage>
    </>
  );
}
