import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendHtmlEmail } from "@/app/(app)/campaigns/email-actions";
import { TRUMIX_LOGO_DATA_URI } from "@/lib/emailAssets";

// חובה: בלי זה Next.js מנסה "לקפוא" (prerender) את הראוט הזה בזמן build ולקרוא
// ל-GET עם בקשה מזויפת, מה שגורם ל-createAdminClient() להיכשל אם משתני הסביבה
// עדיין לא זמינים בזמן build (הם קיימים רק ב-runtime בפועל)
export const dynamic = "force-dynamic";

const RTL = "direction: rtl; text-align: right;";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// עיצוב מייל התזכורת בסגנון המערכת (צבעי brass/sage, לוגו וארגון, כרטיס לבן מעוגל) -
// תואם בסגנונו למייל ההודעה שמלווה דו"חות (lib/notificationEmailTemplate.ts)
function buildReminderEmailHtml(input: {
  orgName: string;
  logoUrl: string | null;
  contactName: string;
  title: string;
  dueLabel: string;
  ctaUrl?: string;
}): string {
  const { orgName, logoUrl, contactName, title, dueLabel, ctaUrl } = input;
  const headerLogo = logoUrl ?? TRUMIX_LOGO_DATA_URI;
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
</head>
<body dir="rtl" style="font-family: Tahoma, Arial, sans-serif; background: #f5f4ef; margin: 0; padding: 28px 16px; ${RTL}">
  <div dir="rtl" style="max-width: 480px; margin: 0 auto; ${RTL}">
    <div style="text-align: center; margin-bottom: 18px;">
      <img src="${escapeHtml(headerLogo)}" alt="${escapeHtml(orgName)}" style="max-height: 56px; max-width: 160px; margin-bottom: 8px;" />
      <div style="font-family: Tahoma, Arial, sans-serif; font-size: 19px; font-weight: 700; color: #33463a;">${escapeHtml(orgName)}</div>
    </div>
    <div style="background: #ffffff; border: 1px solid #ddd9d0; border-radius: 16px; padding: 26px 24px; ${RTL}">
      <div dir="rtl" style="display: inline-block; background: #eef1e7; color: #4a6b34; font-family: Tahoma, Arial, sans-serif; font-size: 12px; font-weight: 700; padding: 5px 14px; border-radius: 20px; margin-bottom: 16px;">
        תזכורת
      </div>
      <p dir="rtl" style="font-family: Tahoma, Arial, sans-serif; font-size: 12.5px; color: #5f6358; margin: 0 0 3px; ${RTL}">עבור</p>
      <p dir="rtl" style="font-family: Tahoma, Arial, sans-serif; font-size: 18px; font-weight: 700; color: #33463a; margin: 0 0 18px; ${RTL}">${escapeHtml(contactName)}</p>
      <p dir="rtl" style="font-family: Tahoma, Arial, sans-serif; font-size: 15px; font-weight: 600; color: #33463a; margin: 0 0 12px; line-height: 1.5; ${RTL}">${escapeHtml(title)}</p>
      <p dir="rtl" style="font-family: Tahoma, Arial, sans-serif; font-size: 12.5px; color: #5f6358; margin: 0; ${RTL}">מועד: ${escapeHtml(dueLabel)}</p>
      ${
        ctaUrl
          ? `<div style="text-align: center; margin-top: 22px;">
               <a href="${escapeHtml(ctaUrl)}" style="display: inline-block; font-family: Tahoma, Arial, sans-serif; background: #7f9a5e; color: #fff; font-weight: 700; font-size: 13.5px; padding: 10px 26px; border-radius: 24px; text-decoration: none;">מעבר לכרטיס איש הקשר</a>
             </div>`
          : ""
      }
    </div>
    <p style="text-align: center; font-family: Tahoma, Arial, sans-serif; font-size: 10.5px; color: #8b9484; margin-top: 16px;">
      הודעה זאת נשלחה אוטומטית ממערכת ${escapeHtml(orgName)}
    </p>
  </div>
</body>
</html>`;
}

// נקרא ע"י Vercel Cron (ראה vercel.json) בתדירות קבועה - שולח מייל התראה חד-פעמי
// (last_emailed_at) לכל תזכורת שהגיע זמנה, אל המשויך אליה ואל כל מנהלי המערכת.
// משתמש בלקוח service-role כי אין כאן session משתמש מחובר (RLS דורש authenticated)
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "לא מורשה" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: org } = await admin.from("org_settings").select("org_name, logo_url").eq("id", true).single();
  const orgName = org?.org_name ?? "תרומיקס";
  const logoUrl = org?.logo_url ?? null;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  const { data: dueTasks, error } = await admin
    .from("contact_tasks")
    .select("id, title, due_at, assigned_to, contact_id, contacts(first_name, last_name)")
    .eq("completed", false)
    .eq("dismissed", false)
    .is("last_emailed_at", null)
    .lte("due_at", nowIso);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!dueTasks || dueTasks.length === 0) return NextResponse.json({ ok: true, processed: 0, emailed: 0 });

  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
  const adminIds = (admins ?? []).map((a) => a.id);

  const emailCache = new Map<string, string | null>();
  async function emailFor(userId: string): Promise<string | null> {
    if (emailCache.has(userId)) return emailCache.get(userId)!;
    const { data } = await admin.auth.admin.getUserById(userId);
    const email = data.user?.email ?? null;
    emailCache.set(userId, email);
    return email;
  }

  let emailed = 0;
  for (const task of dueTasks) {
    const c = task.contacts as unknown as { first_name: string; last_name: string } | null;
    const contactName = c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "";
    const recipientIds = new Set<string>(adminIds);
    if (task.assigned_to) recipientIds.add(task.assigned_to);

    const recipients = (await Promise.all(Array.from(recipientIds).map(emailFor))).filter(Boolean) as string[];
    const uniqueRecipients = Array.from(new Set(recipients));

    if (uniqueRecipients.length > 0) {
      const subject = `תזכורת: ${task.title}`;
      const dueLabel = new Date(task.due_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
      const html = buildReminderEmailHtml({
        orgName,
        logoUrl,
        contactName,
        title: task.title,
        dueLabel,
        ctaUrl: siteUrl ? `${siteUrl}/contacts?open=${task.contact_id}` : undefined,
      });
      await Promise.all(uniqueRecipients.map((to) => sendHtmlEmail(to, subject, html)));
      emailed++;
    }

    await admin.from("contact_tasks").update({ last_emailed_at: nowIso }).eq("id", task.id);
  }

  return NextResponse.json({ ok: true, processed: dueTasks.length, emailed });
}
