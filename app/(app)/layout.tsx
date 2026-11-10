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
      <div className={`oa-app ${interTight.variable}`}>
        <AppChrome />
      </div>
      {children}
    </>
  );
}
