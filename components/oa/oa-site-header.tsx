import { HeaderMorph } from "@/components/oa/header-morph";
import { StartFreeButton } from "@/components/oa/start-free-button";
import { OaProfileButton } from "@/components/oa/oa-profile-button";
import { OaHeaderSearchButton } from "@/components/oa/oa-header-search-button";
import { MobileNav } from "@/components/oa/mobile-nav";
import { getLandingUserContext } from "@/components/terminal-landing-streams";

export async function OaSiteHeader() {
  const user = await getLandingUserContext();

  return (
    <>
      <HeaderMorph>
        <a href="/" className="flex items-center gap-2 pl-3 text-[17px] font-medium tracking-tight text-oa-fg sm:pl-0">
          stocksbrew
        </a>
        <nav className="hidden items-center gap-1 text-[15.5px] text-oa-muted-fg sm:flex" aria-label="Site">
          <a href="/pulse" className="rounded-full px-3 py-1.5 transition-colors hover:bg-oa-accent hover:text-oa-fg">
            Market
          </a>
          <a href="/explore" className="rounded-full px-3 py-1.5 transition-colors hover:bg-oa-accent hover:text-oa-fg">
            Explore
          </a>
          <a href="/watchlist" className="rounded-full px-3 py-1.5 transition-colors hover:bg-oa-accent hover:text-oa-fg">
            Watchlist
          </a>
        </nav>
        <div className="flex items-center gap-2 pr-3 sm:gap-3 sm:pr-0">
          <OaHeaderSearchButton />
          {user.signedIn ? (
            <OaProfileButton />
          ) : (
            <StartFreeButton surface="header" size="sm" label="Start free" />
          )}
        </div>
      </HeaderMorph>
      <MobileNav />
    </>
  );
}
