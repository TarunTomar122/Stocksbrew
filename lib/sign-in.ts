import { getAdditionalUserInfo, GoogleAuthProvider, signInWithPopup, type User, type UserCredential } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { type AuthSurface, trackSigninFailed, trackSigninStarted, trackUserSignedIn } from "@/lib/product-analytics";
import { identifyUser } from "@/lib/posthog";

type SignInOptions = {
  surface?: AuthSurface;
};

export const POST_SIGNUP_ONBOARDING_PENDING = "stocksbrew:onboarding:pending";

export async function syncServerSession(user?: User | null): Promise<void> {
  const currentUser = user ?? getFirebaseAuth().currentUser;
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
  const auth = getFirebaseAuth();
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
