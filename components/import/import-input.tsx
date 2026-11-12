"use client";

import { useEffect, useRef, useState } from "react";

import { isCsvFile, isSpreadsheetFile } from "@/components/import/client";
import { MAX_IMAGES } from "@/lib/import/upload";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

export type ImportInputValue = { files: File[]; text: string };

const PICK_BASE = `inline-flex h-10 items-center gap-2 rounded border bg-oa-card px-3.5 text-[14px] font-medium ${FOCUS}`;
const PICK = `${PICK_BASE} border-oa-border text-oa-fg hover:border-oa-fg/30`;
/** The CSV pick leads on /import: the same shape, in the accent colour. */
const PICK_LEAD = `${PICK_BASE} border-oa-primary text-oa-primary hover:bg-[color-mix(in_srgb,var(--oa-primary)_8%,transparent)]`;

const CAMERA = (
  <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="2.5" y="4" width="15" height="12" rx="2" />
    <circle cx="7.5" cy="8.5" r="1.5" />
    <path d="m3 14 4.5-4 3.5 3 2.5-2 3.5 3" strokeLinejoin="round" />
  </svg>
);

/**
 * Screenshots or text in. Drop, choose or paste images (up to four); or paste
 * tickers, a list of holdings or a CSV export. One button reads whatever is
 * there. With `onCsv`, a CSV file (chosen or dropped) is handed straight over
 * instead, and the box leads with it.
 */
export function ImportInput({
  busy,
  error,
  submitLabel = "Read my stocks",
  textPlaceholder = "AAPL 10 182.50\nNVDA 25\nMSFT",
  onSubmit,
  onCsv,
  incoming,
  note,
}: {
  busy: boolean;
  error: string | null;
  submitLabel?: string;
  textPlaceholder?: string;
  onSubmit: (value: ImportInputValue) => void;
  /** A CSV or spreadsheet file was chosen or dropped here. Without it the box takes screenshots only. */
  onCsv?: (file: File) => void;
  /** Screenshots dropped elsewhere on the page, added to this box. `at` tells one drop from the next. */
  incoming?: { files: File[]; at: number } | null;
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
  const csvPicker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  useEffect(() => {
    if (incoming?.files.length) add(incoming.files);
    // Only a new drop adds files; `add` reads the current list each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming?.at]);

  function add(list: FileList | File[] | null) {
    const all = Array.from(list ?? []);
    const sheet = onCsv ? all.find((file) => isCsvFile(file) || isSpreadsheetFile(file)) : undefined;
    if (sheet) {
      onCsv!(sheet);
      return;
    }
    const images = all.filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name));
    if (images.length === 0) {
      if (all.length > 0) setLocal(onCsv ? "That file is not a CSV or a screenshot." : "That file is not a screenshot. Use a PNG, JPEG or WebP image.");
      return;
    }
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
        {onCsv ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => csvPicker.current?.click()} className={PICK_LEAD}>
                <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M5 2.5h6.5L15 6v11.5H5z" strokeLinejoin="round" />
                  <path d="M11.5 2.5V6H15M7.5 10.5h5M7.5 13.5h5" strokeLinecap="round" />
                </svg>
                Upload your broker&apos;s CSV
              </button>
              <button type="button" onClick={() => picker.current?.click()} className={PICK}>
                {CAMERA}
                {files.length > 0 ? "Add another screenshot" : "Choose screenshots"}
              </button>
            </div>
            <p className="text-pretty text-[13px] leading-[18px] text-oa-muted-fg">
              We read the positions download from Fidelity, Schwab, Vanguard, Robinhood, E*TRADE, Morgan Stanley, Interactive Brokers, Webull and M1, and
              any other CSV with a ticker and a shares column. Screenshots of your holdings screen work too, up to {MAX_IMAGES}.
            </p>
            <input
              ref={csvPicker}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose a CSV file"
              onChange={(event) => {
                add(event.target.files);
                event.target.value = "";
              }}
            />
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" onClick={() => picker.current?.click()} className={PICK}>
              {CAMERA}
              {files.length > 0 ? "Add another screenshot" : "Choose screenshots"}
            </button>
            <p className="min-w-0 text-pretty text-[13px] leading-[18px] text-oa-muted-fg">
              The holdings screen of your broker app. Drop or paste them here, up to {MAX_IMAGES}.
            </p>
          </div>
        )}
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
