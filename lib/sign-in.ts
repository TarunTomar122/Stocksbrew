import { getAdditionalUserInfo, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { type AuthSurface, trackUserSignedIn } from "@/lib/product-analytics";

type SignInOptions = {
  surface?: AuthSurface;
};

export async function signInWithGoogle(options: SignInOptions = {}): Promise<void> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  const isNewUser = Boolean(getAdditionalUserInfo(result)?.isNewUser);
  trackUserSignedIn({
    surface: options.surface ?? "unknown",
    isNewUser,
  });
}
