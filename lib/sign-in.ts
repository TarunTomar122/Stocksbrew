// firebase/auth is not part of any page's first JavaScript (it is about 37KB gzipped with firebase/app): it loads on
// first use, from lib/firebase-auth-lazy.ts. lib/auth-context.tsx starts that load as soon as a page has hydrated, so a
// tap on a sign-in button normally finds it in memory and the popup opens synchronously in the same tap (no await
// before signInWithPopup, which Safari needs to allow the popup). A tap in the moment before it has arrived waits for
// it, and Safari may then block the popup; tapping again works.
import type { User, UserCredential } from "firebase/auth";
import { type AuthSurface, trackSigninFailed, trackSigninStarted, trackUserSignedIn } from "@/lib/product-analytics";
import { identifyUser } from "@/lib/posthog";

type SignInOptions = {
  surface?: AuthSurface;
};

export const POST_SIGNUP_ONBOARDING_PENDING = "stocksbrew:onboarding:pending";
/** Set once the first-run dialog has been finished or skipped, so it never opens twice. */
export const POST_SIGNUP_ONBOARDING_SEEN = "stocksbrew:onboarding:seen";

type LoadedAuth = Awaited<ReturnType<typeof importAuth>>;
let loaded: LoadedAuth | null = null;
let loading: Promise<LoadedAuth> | null = null;
/** Set once Firebase has restored any stored sign-in, so `auth.currentUser` is the real answer. */
let restored = false;

async function importAuth() {
  const { getFirebaseAuth, GoogleAuthProvider, getAdditionalUserInfo, onIdTokenChanged, signInWithPopup } = await import("@/lib/firebase-auth-lazy");
  return { auth: getFirebaseAuth(), GoogleAuthProvider, getAdditionalUserInfo, onIdTokenChanged, signInWithPopup };
}

/** The firebase/auth functions the app uses and its Auth instance, loaded on first use. */
export async function loadFirebaseAuth(): Promise<LoadedAuth> {
  if (loaded) return loaded;
  // One import for every caller that asks before it has arrived.
  loading ??= importAuth().then((mod) => {
    loaded = mod;
    void mod.auth.authStateReady().then(
      () => (restored = true),
      () => (restored = true),
    );
    return mod;
  });
  try {
    return await loading;
  } catch (error) {
    loading = null; // a failed chunk load can be retried on the next tap
    throw error;
  }
}

/**
 * The user Firebase has signed in in this browser, if any (it loads firebase/auth on first use). It waits for Firebase
 * to restore a stored sign-in, so someone signed in is never taken for signed out in the moment after a page loads.
 */
export async function currentFirebaseUser(): Promise<User | null> {
  const { auth } = await loadFirebaseAuth();
  await auth.authStateReady().catch(() => undefined);
  return auth.currentUser;
}

/**
 * Whether someone is signed in, answered without waiting once firebase/auth has loaded and restored any stored sign-in
 * (`undefined` before then). Sign-in buttons check this first so a tap reaches the popup with no await in between.
 */
export function signedInNow(): boolean | undefined {
  const user = firebaseUserNow();
  return user === undefined ? undefined : Boolean(user);
}

/**
 * The signed-in Firebase user without waiting, once firebase/auth has loaded and restored any stored sign-in
 * (`undefined` before then). Use it before a sign-in popup: `firebaseUserNow() ?? (await currentFirebaseUser())` would
 * wait even when the answer is known, so callers check for `undefined` explicitly.
 */
export function firebaseUserNow(): User | null | undefined {
  return loaded && restored ? loaded.auth.currentUser : undefined;
}

export async function syncServerSession(user?: User | null): Promise<void> {
  const currentUser = user ?? (await loadFirebaseAuth()).auth.currentUser;
  if (!currentUser) throw new Error("No signed-in user");
  const idToken = await currentUser.getIdToken();
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) throw new Error("Could not start your session");
}

export async function signInWithGoogle(options: SignInOptions = {}): Promise<UserCredential> {
  // Loaded already: no await before the popup opens, so the tap still counts as the user's gesture.
  const { auth, GoogleAuthProvider, signInWithPopup, getAdditionalUserInfo } = loaded ?? (await loadFirebaseAuth());
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const surface = options.surface ?? "unknown";
  trackSigninStarted({ surface });
  let result: UserCredential;
  try {
    result = await signInWithPopup(auth, provider);
    await syncServerSession(result.user);
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    trackSigninFailed({ surface, reason: typeof code === "string" ? code : error instanceof Error ? error.message : "unknown" });
    throw error;
  }
  const isNewUser = Boolean(getAdditionalUserInfo(result)?.isNewUser);
  if (isNewUser) localStorage.setItem(POST_SIGNUP_ONBOARDING_PENDING, "1");
  // Identify synchronously before the signup/sign-in event. Waiting for the
  // AuthProvider callback can split the anonymous journey and the new account
  // into different PostHog people, which breaks acquisition and activation
  // funnels even when the user flow itself succeeds.
  // Only the uid goes to analytics: no email or name.
  identifyUser(result.user.uid, isNewUser ? { signed_up_at: new Date().toISOString().slice(0, 10) } : undefined);
  trackUserSignedIn({
    surface,
    isNewUser,
  });
  return result;
}
