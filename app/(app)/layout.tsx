import { AppChrome } from "@/components/oa/app-chrome";
import { interTight } from "@/components/oa/font";

/**
 * Everything inside the app shares this layout, so the sidebar, the phone
 * top bar and the tab bar are drawn once and stay put while pages and their
 * loading states swap in the content area. Pages render only their own
 * `<main>`; they must not draw navigation.
 */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {/* `contents`: the wrapper only carries the tokens and the font. Without it the phone top bar
          could only stick inside this wrapper, so it scrolled away with the first screen. */}
      <div className={`oa-app contents ${interTight.variable}`}>
        <AppChrome />
      </div>
      {children}
    </>
  );
}
