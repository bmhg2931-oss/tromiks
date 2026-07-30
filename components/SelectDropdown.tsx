"use client";

import { useEffect, useRef, useState } from "react";

function ChevronDownIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-ink-soft"
    >
      <path d="M2.5 4.5L6 8l3.5-3.5" />
    </svg>
  );
}

export default function SelectDropdown({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="in flex items-center justify-between gap-2 text-right">
        <span>{current?.label ?? ""}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-line rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className="block w-full text-right px-3 py-1.5 text-sm hover:bg-parchment border-b border-line last:border-b-0"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
