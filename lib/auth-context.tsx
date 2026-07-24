"use client";

import { User, onIdTokenChanged } from "firebase/auth";
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

import { getFirebaseAuth } from "@/lib/firebase-client";
import { identifyUser, initPostHog, posthog } from "@/lib/posthog";

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
    const auth = getFirebaseAuth();
    const unsub = onIdTokenChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (loading) setLoading(false);
      if (nextUser) {
        identifyUser(nextUser.uid, {
          email: nextUser.email ?? undefined,
          name: nextUser.displayName ?? undefined,
        });
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
              router.refresh();
            }
          }
        } catch {
          // server-side session sync is best-effort
        }
      } else {
        posthog.reset();
        refreshedAfterSignInRef.current = false;
        try {
          await fetch("/api/auth/session", { method: "DELETE" });
        } catch {
          // ignore
        }
      }
    });
    return () => unsub();
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
