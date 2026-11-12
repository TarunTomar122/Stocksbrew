/**
 * Text width for the share cards, from the advance widths of the face they draw with (assets/og/instrument-sans-400.ttf,
 * read from its hmtx table; 1 = one em). Satori does not tell us where it wraps, so a card that must not cut a line
 * measures it here first. Kerning is not counted, so callers keep a small margin; a character outside the table counts
 * as the widest glyph, so an unknown character can only make a line look longer than it is.
 */

/** Advance width in ems, Instrument Sans 400. */
const SANS_400: Record<string, number> = { " ": 0.2, "!": 0.273, "\"": 0.384, "#": 0.716, "$": 0.608, "%": 0.786, "&": 0.755, "'": 0.232, "(": 0.406, ")": 0.406, "*": 0.408, "+": 0.531, ",": 0.255, "-": 0.506, ".": 0.255, "/": 0.443, "0": 0.666, "1": 0.391, "2": 0.545, "3": 0.574, "4": 0.6, "5": 0.574, "6": 0.599, "7": 0.532, "8": 0.582, "9": 0.61, ":": 0.255, ";": 0.255, "<": 0.531, "=": 0.531, ">": 0.531, "?": 0.567, "@": 0.853, "A": 0.728, "B": 0.636, "C": 0.741, "D": 0.752, "E": 0.638, "F": 0.602, "G": 0.765, "H": 0.736, "I": 0.254, "J": 0.455, "K": 0.692, "L": 0.588, "M": 0.906, "N": 0.736, "O": 0.786, "P": 0.656, "Q": 0.787, "R": 0.656, "S": 0.608, "T": 0.648, "U": 0.712, "V": 0.728, "W": 1.089, "X": 0.688, "Y": 0.676, "Z": 0.623, "[": 0.406, "\\": 0.443, "]": 0.406, "^": 0.531, "_": 0.426, "`": 0.354, "a": 0.533, "b": 0.606, "c": 0.533, "d": 0.606, "e": 0.564, "f": 0.354, "g": 0.606, "h": 0.599, "i": 0.24, "j": 0.24, "k": 0.535, "l": 0.24, "m": 0.922, "n": 0.599, "o": 0.584, "p": 0.606, "q": 0.606, "r": 0.375, "s": 0.473, "t": 0.377, "u": 0.589, "v": 0.523, "w": 0.767, "x": 0.551, "y": 0.523, "z": 0.496, "{": 0.406, "|": 0.242, "}": 0.406, "~": 0.531, "’": 0.255, "‘": 0.255, "“": 0.409, "”": 0.409, "—": 0.886, "–": 0.586, "…": 0.655, "€": 0.701, "£": 0.588, "·": 0.103, "•": 0.306, "é": 0.564 };

const WIDEST = Math.max(...Object.values(SANS_400));

/** Width of `text` in pixels at `fontSize`, in Instrument Sans 400. */
export function textWidth(text: string, fontSize: number): number {
  let ems = 0;
  for (const char of text) ems += SANS_400[char] ?? WIDEST;
  return ems * fontSize;
}

/**
 * Whether `text` wraps into at most `lines` lines of `width` pixels, breaking only at spaces as a greedy wrap does.
 * Satori can also break after a hyphen, which only makes lines shorter, so this never says yes when it would not fit.
 * A single word wider than a line never fits (it would be cut mid-word).
 */
export function fitsLines(text: string, options: { fontSize: number; width: number; lines: number }): boolean {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return false;
  const space = textWidth(" ", options.fontSize);
  let used = 1;
  let line = 0;
  for (const word of words) {
    const width = textWidth(word, options.fontSize);
    if (width > options.width) return false;
    if (line === 0) line = width;
    else if (line + space + width <= options.width) line += space + width;
    else {
      used += 1;
      line = width;
      if (used > options.lines) return false;
    }
  }
  return true;
}
