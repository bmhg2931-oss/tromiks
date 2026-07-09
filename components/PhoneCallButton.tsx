"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function PhoneIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2.3c0-.4.3-.7.7-.7l1.7.3c.4 0 .6.3.7.6l.4 1.6c.1.3 0 .7-.3.9l-.9.9c.7 1.5 1.9 2.7 3.4 3.4l.9-.9c.2-.3.6-.4.9-.3l1.6.4c.3.1.6.3.6.7l.3 1.7c0 .4-.3.7-.7.7C7.6 13.2 2.8 8.4 2.8 2.9" />
    </svg>
  );
}

// תיקון פורמט למספר טלפון לפני חיוג: השלמת 0 מוביל שחסר במספר מקומי, והמרת
// קידומת "+" ל-"00" (או הוספתה אם חסרה) במספר חו"ל, כפי שתוכנת חיוג במחשב מצפה לקבל
function normalizePhoneForDialing(raw: string): string {
  const stripped = raw.replace(/[^\d+]/g, "");
  if (stripped.startsWith("+")) return "00" + stripped.slice(1);
  if (stripped.startsWith("00")) return stripped;
  if (!stripped.startsWith("0")) return "0" + stripped;
  return stripped;
}

export default function PhoneCallButton({ phone }: { phone: string }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  function showBubble() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom + 4, left: rect.right });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  if (!phone) return null;
  const dialNumber = normalizePhoneForDialing(phone);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={showBubble}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          showBubble();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          window.location.href = `tel:${dialNumber}`;
        }}
        aria-label="חיוג (שתי לחיצות רצופות מחייגות)"
        className="flex items-center justify-center w-6 h-6 rounded-full border border-white text-ink-soft hover:bg-parchment/70 hover:text-ink transition shrink-0"
      >
        <PhoneIcon />
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            style={{ position: "fixed", top: coords.top, left: coords.left, transform: "translateX(-100%)" }}
            className="z-[200] bg-white border border-line rounded-lg shadow-lg px-3 py-2 whitespace-nowrap text-sm font-semibold text-ink pointer-events-none"
          >
            {dialNumber}
          </div>,
          document.body
        )}
    </>
  );
}
