"use client";

import { useEffect, useRef, useState } from "react";

import { MAX_IMAGES } from "@/lib/import/upload";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

export type ImportInputValue = { files: File[]; text: string };

/**
 * Screenshots or text in. Drop, choose or paste images (up to four); or paste
 * tickers, a list of holdings or a CSV export. One button reads whatever is
 * there.
 */
export function ImportInput({
  busy,
  error,
  submitLabel = "Read my stocks",
  textPlaceholder = "AAPL 10 182.50\nNVDA 25\nMSFT",
  onSubmit,
  note,
}: {
  busy: boolean;
  error: string | null;
  submitLabel?: string;
  textPlaceholder?: string;
  onSubmit: (value: ImportInputValue) => void;
  /** A short line under the button: limits, privacy. */
  note?: React.ReactNode;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [drag, setDrag] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  // Previews the browser could not draw (a HEIC on Chrome, a file that is not an image) show as a blank tile.
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  function add(list: FileList | File[] | null) {
    const images = Array.from(list ?? []).filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name));
    if (images.length === 0) return;
    const next = [...files, ...images];
    setLocal(next.length > MAX_IMAGES ? `Up to ${MAX_IMAGES} screenshots at a time. We kept the first ${MAX_IMAGES}.` : null);
    setFiles(next.slice(0, MAX_IMAGES));
  }

  const ready = files.length > 0 || text.trim().length > 0;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) onSubmit({ files, text });
      }}
    >
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          add(event.dataTransfer.files);
        }}
        className={`flex flex-col gap-3 rounded border border-dashed px-4 py-4 transition-colors ${
          drag ? "border-oa-primary bg-[color-mix(in_srgb,var(--oa-primary)_6%,transparent)]" : "border-oa-border bg-oa-bg"
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className={`inline-flex h-10 items-center gap-2 rounded border border-oa-border bg-oa-card px-3.5 text-[14px] font-medium text-oa-fg hover:border-oa-fg/30 ${FOCUS}`}
          >
            <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="2.5" y="4" width="15" height="12" rx="2" />
              <circle cx="7.5" cy="8.5" r="1.5" />
              <path d="m3 14 4.5-4 3.5 3 2.5-2 3.5 3" strokeLinejoin="round" />
            </svg>
            {files.length > 0 ? "Add another screenshot" : "Choose screenshots"}
          </button>
          <p className="min-w-0 text-pretty text-[13px] leading-[18px] text-oa-muted-fg">
            The holdings screen of your broker app. Drop or paste them here, up to {MAX_IMAGES}.
          </p>
          <input
            ref={picker}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose screenshots"
            onChange={(event) => {
              add(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
        {files.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Screenshots to read">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="relative">
                {previews[index] && !broken.has(previews[index]!) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previews[index]}
                    alt={`Screenshot ${index + 1}`}
                    onError={() => setBroken((current) => new Set(current).add(previews[index]!))}
                    className="h-24 w-16 rounded border border-oa-border bg-oa-card object-cover object-top"
                  />
                ) : (
                  <span role="img" aria-label={`Screenshot ${index + 1}, no preview`} className="block h-24 w-16 rounded border border-oa-border bg-oa-card" />
                )}
                <button
                  type="button"
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  aria-label={`Remove screenshot ${index + 1}`}
                  className={`absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border border-oa-border bg-oa-card text-[13px] leading-none text-oa-fg shadow-sm ${FOCUS}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-oa-muted-fg">Or paste tickers, holdings or a CSV export</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onPaste={(event) => {
            const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
            if (images.length > 0) {
              event.preventDefault();
              add(images);
            }
          }}
          rows={4}
          spellCheck={false}
          placeholder={textPlaceholder}
          className={`oa-mono w-full resize-y rounded border border-oa-border bg-oa-card px-3 py-2 text-[13px] leading-5 text-oa-fg placeholder:text-oa-muted-fg ${FOCUS}`}
        />
      </label>

      {error || local ? (
        <p role="alert" className="text-pretty text-[13px] leading-[18px] text-signal-bearish">
          {error ?? local}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="submit"
          disabled={!ready || busy}
          className={`inline-flex h-10 items-center gap-2 rounded border border-oa-primary bg-oa-primary px-4 text-[14px] font-medium text-oa-primary-fg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
        >
          {busy ? (
            <>
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
              {files.length > 0 ? "Reading your screenshots" : "Reading"}
            </>
          ) : (
            submitLabel
          )}
        </button>
        {note ? <p className="min-w-0 text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">{note}</p> : null}
      </div>
    </form>
  );
}
