"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchContactHistory, type ContactHistoryRow } from "./history-actions";
import { getOrgSettings } from "../settings/branding-actions";
import { buildContactReportHtml, computeReportBalances } from "@/lib/reportTemplate";
import { buildDocumentNotificationEmailHtml } from "@/lib/notificationEmailTemplate";
import { sendHtmlEmail } from "../campaigns/email-actions";
import { htmlToPdfBase64 } from "@/lib/pdf";
import { logContactActivity } from "@/lib/activityLog";
import { PAYMENT_HUBS, type Contact, type OrgSettings } from "@/lib/types";

type ReportResult = { ok: boolean; html?: string; contactEmail?: string | null; fileBaseName?: string; error?: string };

function computeFileBaseName(contact: Contact): string {
  const name = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim();
  return contact.city ? `${name} - ${contact.city}` : name;
}

async function loadReportInputs(contactId: string, title?: string, docNotes?: string) {
  const supabase = await createClient();
  const [{ data: contact }, historyRes, org] = await Promise.all([
    supabase.from("contacts").select("*").eq("id", contactId).single(),
    fetchContactHistory(contactId),
    getOrgSettings(),
  ]);
  if (!contact) return { ok: false as const, error: "איש קשר לא נמצא" };
  if (!historyRes.ok) return { ok: false as const, error: historyRes.error ?? "שגיאה בטעינת היסטוריה" };

  const rows = historyRes.rows ?? [];
  const html = buildContactReportHtml({ contact: contact as Contact, rows, org, title, docNotes });
  return { ok: true as const, html, contact: contact as Contact, org, rows };
}

function balanceSnapshotLabel(rows: ContactHistoryRow[]) {
  const balances = computeReportBalances(rows).filter((b) => b.balance > 0);
  if (balances.length === 0) return "אין יתרה פתוחה";
  return `יתרה פתוחה: ${balances.map((b) => `${b.currency}${b.balance.toLocaleString("he-IL")}`).join(", ")}`;
}

export async function generateContactReportHtml(contactId: string, title?: string, docNotes?: string): Promise<ReportResult> {
  const res = await loadReportInputs(contactId, title, docNotes);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, html: res.html, contactEmail: res.contact.email, fileBaseName: computeFileBaseName(res.contact) };
}

export async function generateContactReportPdf(
  contactId: string,
  title?: string,
  docNotes?: string
): Promise<{ ok: boolean; pdfBase64?: string; fileBaseName?: string; error?: string }> {
  const res = await loadReportInputs(contactId, title, docNotes);
  if (!res.ok) return { ok: false, error: res.error };
  try {
    const pdfBase64 = await htmlToPdfBase64(res.html);
    await logContactActivity(contactId, `הורדת ${title ?? "דו״ח מסכם"}`, balanceSnapshotLabel(res.rows));
    return { ok: true, pdfBase64, fileBaseName: computeFileBaseName(res.contact) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה בהפקת PDF" };
  }
}

export type EmailContactSuggestion = { id: string; name: string; email: string; avatarUrl: string };

// חיפוש אנשי קשר עם כתובת מייל (לרשימה הנפתחת של נמענים בטופס השליחה). תמונת
// הפרופיל דרך Gravatar (לפי hash של המייל) - זו אמנם לא "תמונת הפרופיל בגוגל"
// (לגוגל אין API ציבורי לשליפת תמונת פרופיל לפי מייל בלי הסכמת אותו משתמש; זו
// מגבלת פרטיות מכוונת מצידם), אבל Gravatar היא השירות המקביל הנפוץ שכן מציג
// תמונה אמיתית אם המשתמש הגדיר כזו, עם תמונת ברירת מחדל נאה אם לא
export async function searchEmailContacts(query: string): Promise<{ ok: boolean; contacts?: EmailContactSuggestion[]; error?: string }> {
  const supabase = await createClient();
  const q = query.trim();
  if (!q) return { ok: true, contacts: [] };

  const { data, error } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email")
    .not("email", "is", null)
    .is("deleted_at", null)
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(8);
  if (error) return { ok: false, error: error.message };

  const { createHash } = await import("crypto");
  const contacts = (data ?? [])
    .filter((c) => c.email)
    .map((c) => {
      const email = c.email as string;
      const hash = createHash("md5").update(email.trim().toLowerCase()).digest("hex");
      return {
        id: c.id,
        name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
        email,
        avatarUrl: `https://www.gravatar.com/avatar/${hash}?d=identicon&s=64`,
      };
    });
  return { ok: true, contacts };
}

export type SendReportEmailInput = {
  contactId: string;
  recipients: string[];
  subject: string;
  body: string;
  paymentHub?: string;
  title?: string;
  docNotes?: string;
};

// טוען את הנתונים הדרושים לפתיחת טופס השליחה (ברירת מחדל למייל/נושא/גוף/רשימת
// מוקדי תשלום מוגדרים) - נקרא כשפותחים את טופס השליחה, לפני שהמשתמש בפועל שולח
export async function getSendReportEmailDefaults(
  contactId: string,
  title?: string
): Promise<{
  ok: boolean;
  contactEmail?: string | null;
  defaultSubject?: string;
  defaultBody?: string;
  paymentHubs?: { hub: string; url: string }[];
  defaultPaymentHub?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: contact }, org, { data: profile }] = await Promise.all([
    supabase.from("contacts").select("email, first_name, last_name").eq("id", contactId).single(),
    getOrgSettings(),
    user ? supabase.from("profiles").select("default_payment_hub").eq("id", user.id).single() : Promise.resolve({ data: null }),
  ]);
  if (!contact) return { ok: false, error: "איש קשר לא נמצא" };

  const docTitle = title ?? "דו״ח מסכם";
  const contactName = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim();
  const applyPlaceholders = (s: string) => s.replace(/\{שם\}/g, contactName).replace(/\{כותרת\}/g, docTitle);
  const defaultBody = org.email_default_body
    ? applyPlaceholders(org.email_default_body)
    : `זוהי הודעה מאגף הגבייה של ${org.org_name}.\nהננו להביא לידיעתך ${docTitle} מצורף/ת בקובץ PDF, ${contactName}.\n\nנשמח אם תוכל/י לעיין בפרטים המצורפים, וליצור עמנו קשר בכל שאלה.`;
  const defaultSubject = org.email_default_subject ? applyPlaceholders(org.email_default_subject) : `${docTitle} - ${org.org_name}`;
  const paymentHubs = Object.entries(org.payment_links ?? {})
    .map(([hub, url]) => ({ hub, url }))
    .sort((a, b) => PAYMENT_HUBS.indexOf(a.hub) - PAYMENT_HUBS.indexOf(b.hub));

  return {
    ok: true,
    contactEmail: contact.email,
    defaultSubject,
    defaultBody,
    paymentHubs,
    defaultPaymentHub: profile?.default_payment_hub,
  };
}

// שולח מייל עם הנושא/גוף שהמשתמש ערך בטופס השליחה, וקישור תשלום אופציונלי (לפי
// מוקד תשלום שנבחר) - המסמך המעוצב (חשבונית/דו"ח) מצורף כקובץ PDF אמיתי
export async function emailContactReport(input: SendReportEmailInput): Promise<{ ok: boolean; error?: string }> {
  const recipients = input.recipients.map((r) => r.trim()).filter(Boolean);
  if (recipients.length === 0) return { ok: false, error: "יש להזין לפחות כתובת דוא&quot;ל אחת" };

  const res = await loadReportInputs(input.contactId, input.title, input.docNotes);
  if (!res.ok) return { ok: false, error: res.error };

  let pdfBase64: string;
  try {
    pdfBase64 = await htmlToPdfBase64(res.html);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה בהפקת PDF" };
  }

  const org: OrgSettings = res.org;
  const ctaUrl = input.paymentHub ? org.payment_links?.[input.paymentHub] : undefined;
  const notificationHtml = buildDocumentNotificationEmailHtml({ org, bodyText: input.body, ctaUrl });
  const fileBaseName = computeFileBaseName(res.contact);

  const results = await Promise.all(
    recipients.map((to) =>
      sendHtmlEmail(to, input.subject, notificationHtml, [{ filename: `${fileBaseName}.pdf`, contentBase64: pdfBase64 }])
    )
  );
  const failed = results.find((r) => !r.ok);
  if (failed) return { ok: false, error: failed.error };
  await logContactActivity(
    input.contactId,
    `שליחת ${input.title ?? "דו״ח מסכם"} במייל`,
    `אל: ${recipients.join(", ")} · ${balanceSnapshotLabel(res.rows)}`
  );
  return { ok: true };
}
