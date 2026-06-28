import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

// Plus Jakarta Sans is the app's display/heading font; JetBrains Mono stands in
// for Geist Mono in the terminal / label UI.
const jakarta = loadJakarta("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});
const mono = loadMono("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const FONT = jakarta.fontFamily;
export const MONO = mono.fontFamily;
export const fontFamily = jakarta.fontFamily;
export const waitUntilDone = async () => {
  await Promise.all([jakarta.waitUntilDone(), mono.waitUntilDone()]);
};
