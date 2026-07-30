import type { OrgSettings } from "./types";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// גוף מייל קצר וידידותי שמלווה את המסמך המצורף (PDF) - הטקסט עצמו נערך ע"י המשתמש
// בטופס השליחה (לא קבוע בקוד), רק העטיפה הוויזואלית (ברכת פתיחה, חתימה, כפתור
// תשלום אופציונלי) קבועה כאן
export function buildDocumentNotificationEmailHtml(input: {
  org: OrgSettings;
  bodyText: string;
  ctaUrl?: string;
}): string {
  const { org, bodyText, ctaUrl } = input;
  const bodyHtml = escapeHtml(bodyText).replace(/\n/g, "<br />");
  // חלק מלקוחות המייל (בפרט Gmail בתצוגת web) מתעלמים מ-dir="rtl" שעל <html>/<body>
  // כשהם "מנקים" את ה-HTML לפני תצוגה, ומשאירים רק style מוטבע - לכן direction:rtl
  // מוגדר במפורש inline על כל אלמנט טקסט, לא רק text-align וה-dir attribute
  const RTL = 'direction: rtl; text-align: right; unicode-bidi: embed;';
  return `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8" /></head>
<body dir="rtl" style="font-family: Tahoma, Arial, sans-serif; color: #2c3428; background: #fff; margin: 0; padding: 24px; ${RTL}">
  <div dir="rtl" style="max-width: 560px; margin: 0 auto; ${RTL}">
    <p dir="rtl" style="font-family: Tahoma, Arial, sans-serif; font-size: 15px; font-weight: 700; margin: 0 0 16px; ${RTL}">שלום וברכה,</p>
    <p dir="rtl" style="font-family: Tahoma, Arial, sans-serif; font-size: 13.5px; line-height: 1.9; margin: 0 0 20px; ${RTL}">${bodyHtml}</p>
    ${
      org.report_signature
        ? `<div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; font-size: 13px; line-height: 1.7; margin-top: 10px; ${RTL}">${org.report_signature}</div>`
        : `<p dir="rtl" style="font-family: Tahoma, Arial, sans-serif; font-size: 13.5px; margin: 0 0 20px; ${RTL}">בברכה,<br />${escapeHtml(org.org_name)}</p>`
    }
    ${
      ctaUrl
        ? `<div style="text-align: center; margin-top: 26px;">
             <a href="${escapeHtml(ctaUrl)}" style="display: inline-block; font-family: Tahoma, Arial, sans-serif; background: #7f9a5e; color: #fff; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 24px; text-decoration: none;">לתשלום לחצו כאן</a>
           </div>`
        : ""
    }
  </div>
</body>
</html>`;
}
