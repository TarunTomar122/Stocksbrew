"use client";

import { useState } from "react";

type Props = {
  defaultValue?: string;
  onCompile?: (text: string) => void;
  isCompiling?: boolean;
};

export function ThesisInput({ defaultValue = "", onCompile, isCompiling }: Props) {
  const [value, setValue] = useState(defaultValue);
  const [isEmpty, setIsEmpty] = useState(!defaultValue);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="thesis-input-heading"
          className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#6b7280]"
        >
          Thesis Input
        </h2>
        <span className="text-[11px] text-[#9ca3af] font-mono tabular-nums">
          {value.length} chars
        </span>
      </div>

      <label className="sr-only" htmlFor="thesis-raw-input">
        Raw investment thesis
      </label>
      <textarea
        id="thesis-raw-input"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setIsEmpty(!e.target.value.trim());
        }}
        placeholder="Paste raw investment thesis — include bull/bear drivers, catalysts, risks..."
        rows={7}
        className="w-full resize-y min-h-[168px] md:min-h-[200px] lg:min-h-[220px] border border-[#e5e7eb] bg-white px-4 py-4 md:px-5 md:py-5 text-[14px] md:text-[15px] leading-[1.75] text-[#111111] placeholder:text-[#9ca3af] outline-none transition-colors focus:border-[#111111] focus:ring-1 focus:ring-[#111111]/10"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onCompile?.(value)}
          disabled={isEmpty || isCompiling}
          aria-busy={isCompiling}
          className="inline-flex h-[38px] items-center gap-1.5 rounded-full bg-[#111111] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[#2a2a2a] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isCompiling ? "Compiling…" : "Compile Thesis"}
        </button>
        {isEmpty && !isCompiling && (
          <span className="text-[12px] text-[#9ca3af]">
            Enter thesis text to begin
          </span>
        )}
      </div>
    </div>
  );
}
