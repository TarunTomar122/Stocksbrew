/** Upload limits for the import, shared by the parse route and the browser that shrinks images before sending. */

export const MAX_IMAGES = 4;
/** Per image, after the browser has shrunk it. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** The whole request: Vercel refuses bodies over 4.5 MB before we see them. */
export const MAX_BODY_BYTES = 4_400_000;

/** The image type from its first bytes; the declared type is not trusted. */
export function sniffImage(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}
