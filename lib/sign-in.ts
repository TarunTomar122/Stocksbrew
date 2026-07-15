import { getAdditionalUserInfo, GoogleAuthProvider, signInWithPopup, type User, type UserCredential } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { type AuthSurface, trackUserSignedIn } from "@/lib/product-analytics";

type SignInOptions = {
  surface?: AuthSurface;
};

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
  const result = await signInWithPopup(auth, provider);
  await syncServerSession(result.user);
  const isNewUser = Boolean(getAdditionalUserInfo(result)?.isNewUser);
  trackUserSignedIn({
    surface: options.surface ?? "unknown",
    isNewUser,
  });
  return result;
}
