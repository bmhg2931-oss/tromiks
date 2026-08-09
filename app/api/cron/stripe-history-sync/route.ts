import { NextRequest, NextResponse } from "next/server";
import { fetchAndStageStripeHistoryPage } from "@/app/(app)/donations/stripe-sync-actions";

// חובה: בלי זה Next.js מנסה "לקפוא" (prerender) את הראוט הזה בזמן build - ר' אותה
// הערה ב-app/api/cron/task-reminders/route.ts
export const dynamic = "force-dynamic";

// נקרא ע"י Vercel Cron (ראה vercel.json) פעם ביום - תפקיד משני/רשת ביטחון בלבד:
// app/api/stripe-webhook/route.ts כבר מכסה עסקאות חדשות בזמן אמת (בשונה מנדרים
// פלוס, ששם ה-cron הוא המנגנון היחיד לסנכרון שוטף כי אין להם webhooks). ה-cron
// הזה תופס רק מקרה שבו webhook נכשל/פוספס
export async function GET(req: NextRequest) {
  // fail-closed: אם CRON_SECRET לא מוגדר בכלל, נקודת הקצה חסומה
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "לא מורשה" }, { status: 401 });
  }

  const result = await fetchAndStageStripeHistoryPage({ useServiceRole: true });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
