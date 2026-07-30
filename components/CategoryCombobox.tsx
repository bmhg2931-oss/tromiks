"use client";

import { useEffect, useRef, useState } from "react";

type NamedItem = { id: string; name: string };

export default function CategoryCombobox({
  name,
  categories,
  value,
  onChange,
  required = false,
  placeholder = "תשלום כללי",
}: {
  name: string;
  categories: NamedItem[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? categories.filter((c) => c.name.toLowerCase().includes(value.trim().toLowerCase()))
    : categories;

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && filtered.length === 1) {
      e.preventDefault();
      onChange(filtered[0].name);
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        name={name}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className="in text-center"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-line rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange(c.name);
                setOpen(false);
              }}
              className="block w-full text-center px-3 py-1.5 text-sm hover:bg-parchment border-b border-line last:border-b-0"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
