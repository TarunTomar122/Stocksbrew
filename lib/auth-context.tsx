"use client";

import type { User } from "firebase/auth";
import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { loadFirebaseAuth } from "@/lib/sign-in";
import { identifyUser, initPostHog, resetAnalyticsIfIdentified } from "@/lib/posthog";
import { setAnalyticsPlan } from "@/lib/product-analytics";

type AuthState = {
  user: User | null;
  loading: boolean;
  /** Server already validated the session cookie - we know the user is authed
   *  even if the Firebase User object hasn't resolved yet on the client. */
  initialAuthed: boolean;
};

const AuthContext = createContext<AuthState>({ user: null, loading: true, initialAuthed: false });

type AuthProviderProps = {
  children: ReactNode;
  /** Whether the server-side session cookie already verified the user is signed in.
   *  When true, we skip the loading skeleton and immediately render as authenticated. */
  initialAuthed?: boolean;
};

export function AuthProvider({ children, initialAuthed = false }: AuthProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!initialAuthed);
  const [showWaitlistCongrats, setShowWaitlistCongrats] = useState(false);
  const refreshedAfterSignInRef = useRef(initialAuthed);

  useEffect(() => {
    initPostHog();
    // firebase/auth loads here, after the page has hydrated, instead of with every page's first JavaScript
    // (lib/sign-in.ts). Its first callback always came after a read of the browser's stored sign-in anyway.
    let cancelled = false;
    let unsub: (() => void) | undefined;
    loadFirebaseAuth()
      .then(({ auth, onIdTokenChanged }) => {
        if (cancelled) return;
        unsub = onIdTokenChanged(auth, onAuthChange);
      })
      // The script could not load (offline, blocked): stop waiting for it; the server's session still decides the page.
      .catch(() => setLoading(false));
    async function onAuthChange(nextUser: User | null) {
      setUser(nextUser);
      if (loading) setLoading(false);
      if (nextUser) {
        // Only the uid: no email or name in analytics. The plan is added by components/posthog-pageview.tsx.
        identifyUser(nextUser.uid);
        try {
          const idToken = await nextUser.getIdToken();
          const res = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          });
          if (res.ok) {
            const payload = (await res.json()) as { waitlistPromoted?: boolean };
            if (payload.waitlistPromoted) {
              setShowWaitlistCongrats(true);
            }
            // First client-side sign-in often changes server-rendered gated UI
            // (e.g. subscribed/unsubscribed locks). Refresh once after cookie sync.
            if (!refreshedAfterSignInRef.current) {
              refreshedAfterSignInRef.current = true;
              // Signed in on the landing page: go straight to the agent thread,
              // the same place middleware sends signed-in visitors to "/".
              // `?home` and a shared `?try=` link stay on the landing, as in middleware.
              const params = new URLSearchParams(window.location.search);
              if (window.location.pathname === "/" && !params.has("home") && !params.has("try")) {
                window.location.assign("/agent");
              } else {
                router.refresh();
              }
            }
          }
        } catch {
          // server-side session sync is best-effort
        }
      } else {
        // Signed out. Forget the person only if this browser was identified:
        // an anonymous visitor's first auth callback is also null, and
        // resetting then would give them a new id on every page load.
        resetAnalyticsIfIdentified();
        setAnalyticsPlan("anon");
        refreshedAfterSignInRef.current = false;
        try {
          await fetch("/api/auth/session", { method: "DELETE" });
        } catch {
          // ignore
        }
      }
    }
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const value = useMemo(() => ({ user, loading, initialAuthed }), [user, loading, initialAuthed]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {showWaitlistCongrats && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-xl">
            <h3 className="text-[20px] font-semibold text-[#111111] tracking-[-0.01em]">
              You’re in. Pro is unlocked.
            </h3>
            <p className="mt-2 text-[14px] text-[#4b5563] leading-relaxed">
              Thanks for joining the waitlist. Your account is now subscribed.
            </p>
            <button
              type="button"
              onClick={() => setShowWaitlistCongrats(false)}
              className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-[#111111] px-4 text-[13px] font-semibold text-white hover:bg-[#000000]"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useUser(): AuthState {
  return useContext(AuthContext);
}
