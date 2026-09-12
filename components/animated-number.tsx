"use client";

/**
 * Renders a formatted number/price with the transitions.dev digit pop-in.
 * Replays whenever `text` changes (key bump remounts the group).
 */
export function AnimatedNumber({ text }: { text: string }) {
  const chars = Array.from(text);
  return (
    <>
      <span aria-hidden className="t-digit-group is-animating" key={text}>
        {chars.map((char, index) => (
          <span
            key={index}
            className="t-digit"
            data-stagger={index === chars.length - 1 ? "2" : index === chars.length - 2 ? "1" : undefined}
          >
            {char}
          </span>
        ))}
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}
