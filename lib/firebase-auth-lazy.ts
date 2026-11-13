"use client";

/**
 * The parts of firebase/auth the app's shared code needs, as one module that is only ever loaded with `import()`
 * (lib/sign-in.ts `loadFirebaseAuth`). Named imports, so the lazy chunk carries these and what they use, not all of
 * firebase/auth. Never import this file statically: that would put firebase back into every page's first JavaScript.
 */
export { GoogleAuthProvider, getAdditionalUserInfo, onIdTokenChanged, signInWithPopup } from "firebase/auth";
export { getFirebaseAuth } from "@/lib/firebase-client";
