import { NextRequest, NextResponse } from "next/server";
import { fetchAndStageNedarimHistoryPage } from "@/app/(app)/donations/nedarim-sync-actions";

// חובה: בלי זה Next.js מנסה "לקפוא" (prerender) את הראוט הזה בזמן build - ר' אותה
// הערה ב-app/api/cron/task-reminders/route.ts
export const dynamic = "force-dynamic";

// נקרא ע"י Vercel Cron (ראה vercel.json) פעם ביום - ממשיך את הסמן המשותף קדימה,
// עמוד אחד בלבד (ר' מגבלת Vercel Hobby: 10 שניות ל-invocation). בלי untilDate -
// הסנכרון השוטף תמיד ממשיך קדימה, לא חוסם על תאריך
export async function GET(req: NextRequest) {
  // fail-closed: אם CRON_SECRET לא מוגדר בכלל, נקודת הקצה חסומה - ר' אותו תיקון
  // שבוצע ב-task-reminders/route.ts (שם היה חור: בלי המשתנה, לא הייתה בדיקה בכלל)
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "לא מורשה" }, { status: 401 });
  }

  const result = await fetchAndStageNedarimHistoryPage({ useServiceRole: true });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
