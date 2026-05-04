"use client";

import { User, onIdTokenChanged } from "firebase/auth";
import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getFirebaseAuth } from "@/lib/firebase-client";

type AuthState = {
  user: User | null;
  loading: boolean;
  /** Server already validated the session cookie — we know the user is authed
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!initialAuthed);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onIdTokenChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (loading) setLoading(false);
      if (nextUser) {
        try {
          const idToken = await nextUser.getIdToken();
          await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          });
        } catch {
          // server-side session sync is best-effort
        }
      } else {
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useUser(): AuthState {
  return useContext(AuthContext);
}
