"use client";

import { useEffect } from "react";

export default function CloseConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Enter") onConfirm();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onConfirm]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
      <div className="bg-white rounded-2xl shadow-xl border border-line/60 p-6 max-w-xs w-full text-center">
        <p className="text-sm font-semibold mb-4">לסגור ללא שמירת שינויים?</p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={onCancel}
            className="border border-line rounded-full px-4 py-2 text-sm hover:bg-parchment transition"
          >
            המשך לערוך
          </button>
          <button
            onClick={onConfirm}
            className="bg-wine hover:bg-wine/90 text-white rounded-full px-4 py-2 text-sm font-semibold transition"
          >
            אישור
          </button>
        </div>
      </div>
    </div>
  );
}
