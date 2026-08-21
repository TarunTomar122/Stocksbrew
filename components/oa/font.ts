import { Inter_Tight } from "next/font/google";

/** Shared Inter Tight instance for every oa-designed surface (300-500 only;
 * the weight ceiling IS the identity). */
export const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-inter-tight",
});
