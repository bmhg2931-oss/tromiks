"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getStripeCheckoutStatus } from "@/app/(app)/donations/stripe-actions";

// Checkout הוא hosted redirect - הדפדפן עוזב את הדף לגמרי ל-Stripe וחוזר עם
// ?stripe_session_id= ב-URL (ר' success_url ב-createStripeCheckoutSession).
// אין כאן state בזיכרון שנשאר בין הדפים (בשונה מ-cardPolling בטפסים של נדרים
// פלוס), אז הרכיב הזה בודק את הפרמטר בעת טעינת /donations ומריץ פולינג קצר
// עד שה-webhook (שיוצר את התרומה בפועל) מספיק לרוץ
export default function StripeCheckoutReturnBanner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("stripe_session_id");
  const [status, setStatus] = useState<"checking" | "confirmed" | "failed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clearedRef = useRef(false);

  useEffect(() => {
    if (!sessionId || clearedRef.current) return;
    clearedRef.current = true;
    setStatus("checking");

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20;
    const interval = setInterval(async () => {
      attempts++;
      const result = await getStripeCheckoutStatus(sessionId);
      if (cancelled) return;
      if (result.status === "confirmed") {
        clearInterval(interval);
        setStatus("confirmed");
        router.refresh();
      } else if (result.status === "failed" || result.status === "not_found") {
        clearInterval(interval);
        setStatus("failed");
        setError(result.status === "failed" ? result.error : "לא נמצא תשלום מתאים");
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        setStatus("failed");
        setError("אישור התשלום מתעכב. ייתכן שהתשלום עדיין יירשם בדקות הקרובות - נא לבדוק ברשימה בעוד רגע.");
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (!status) return null;

  return (
    <div
      className={`border rounded-xl p-3 mb-4 text-sm ${
        status === "confirmed" ? "border-[#4a6b34]/40 bg-[#eef1e7] text-[#4a6b34]" : status === "failed" ? "border-wine/40 bg-[#fdf1f1] text-wine" : "border-line bg-parchment/40 text-ink-soft"
      }`}
    >
      {status === "checking" && "מאמת תשלום מול Stripe..."}
      {status === "confirmed" && "התשלום אושר והתרומה נוצרה בהצלחה."}
      {status === "failed" && (error || "אירעה שגיאה באימות התשלום.")}
      <button
        type="button"
        onClick={() => router.replace("/donations")}
        className="mr-3 underline"
      >
        סגירה
      </button>
    </div>
  );
}
