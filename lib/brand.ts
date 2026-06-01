/** Replace legacy tikrr branding in user-visible strings (e.g. cached Firestore copy). */
export function scrubLegacyBrand(text: string): string {
  return text.replace(/\btikrr\b/gi, "stocksbrew");
}
