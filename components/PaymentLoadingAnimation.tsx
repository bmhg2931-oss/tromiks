"use client";

// אנימציית טעינה למסכי עריכת התחייבות/תשלום - ערימת מטבעות "נושמת" עם נקודות
// מקפצות, באותו סגנון בדיוק כמו אנימציית הטעינה של כרטיס איש קשר
export default function PaymentLoadingAnimation() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 text-ink-soft">
      <svg
        width="168"
        height="168"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-pulse text-brass"
      >
        <ellipse cx="8" cy="5" rx="4.5" ry="2.2" />
        <path d="M3.5 5v3c0 1.2 2 2.2 4.5 2.2s4.5-1 4.5-2.2V5" />
        <path d="M3.5 8v3c0 1.2 2 2.2 4.5 2.2s4.5-1 4.5-2.2V8" />
      </svg>
      <div className="flex gap-2.5">
        <span className="w-4 h-4 rounded-full bg-brass animate-bounce [animation-delay:-0.3s]" />
        <span className="w-4 h-4 rounded-full bg-brass animate-bounce [animation-delay:-0.15s]" />
        <span className="w-4 h-4 rounded-full bg-brass animate-bounce" />
      </div>
    </div>
  );
}
