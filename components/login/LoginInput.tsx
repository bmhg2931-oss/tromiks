"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "../icons";

export default function LoginInput({
  label,
  type,
  value,
  onChange,
  required,
  minLength,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (show ? "text" : "password") : type;

  return (
    <div>
      <label className="block text-xs font-semibold text-ink-soft mb-1">{label}</label>
      <div className="relative">
        <input
          type={inputType}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full border border-line rounded-full px-4 py-2.5 text-sm bg-white/80 transition-all duration-200 focus:outline-none focus:border-brass focus:ring-4 focus:ring-brass/15 ${
            isPassword ? "pl-10" : ""
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "הסתרת סיסמה" : "הצגת סיסמה"}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink transition"
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
    </div>
  );
}
