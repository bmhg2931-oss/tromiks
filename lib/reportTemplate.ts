import type { ContactHistoryRow } from "@/app/(app)/contacts/history-actions";
import type { Contact, OrgSettings } from "./types";
import { formatAddressLines } from "./address";
import { describeHebrewDate, parseLocalISODate } from "./hebrewDate";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function formatGregorianDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function money(amount: number | null, currency: string | null) {
  if (amount == null) return "";
  return `${currency ?? ""}${Number(amount).toLocaleString("he-IL")}`;
}

function rowLabel(r: ContactHistoryRow): string {
  if (r.recordType === "combined") return "התחייבות ותשלום";
  if (r.recordType === "pledge") return "התחייבות";
  if (r.paymentMethod === "זיכוי") return "זיכוי";
  return "תשלום";
}

export type ReportBalance = { currency: string; pledged: number; paid: number; balance: number };

export function computeReportBalances(rows: ContactHistoryRow[]): ReportBalance[] {
  const pledged: Record<string, number> = {};
  const paid: Record<string, number> = {};
  for (const r of rows) {
    if (r.debitAmount != null && r.debitCurrency) pledged[r.debitCurrency] = (pledged[r.debitCurrency] || 0) + r.debitAmount;
    if (r.creditAmount != null && r.creditCurrency) paid[r.creditCurrency] = (paid[r.creditCurrency] || 0) + r.creditAmount;
  }
  const currencies = new Set([...Object.keys(pledged), ...Object.keys(paid)]);
  return Array.from(currencies).map((currency) => ({
    currency,
    pledged: pledged[currency] || 0,
    paid: paid[currency] || 0,
    balance: (pledged[currency] || 0) - (paid[currency] || 0),
  }));
}

export function buildContactReportHtml(input: {
  contact: Contact;
  rows: ContactHistoryRow[];
  org: OrgSettings;
  title?: string;
  docNotes?: string;
}): string {
  const { contact, rows, org } = input;
  const title = input.title ?? "דו״ח מסכם";
  const notesText = input.docNotes?.trim() || contact.notes || "—";
  const balances = computeReportBalances(rows);
  const contactName = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim();
  const now = new Date();
  const generatedDate = now.toLocaleDateString("he-IL");
  const generatedTime = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const genHebrew = describeHebrewDate(now);
  const genHebrewLine = `${genHebrew.hebrewDate} | יום ${genHebrew.weekday}${genHebrew.parsha ? ` | ${genHebrew.parsha}` : ""}`;

  const { line1: addressLine1, line2: addressLine2 } = formatAddressLines(contact.street, contact.house_number, contact.city);
  const addressFull = [addressLine1, addressLine2].filter(Boolean).join(", ") || contact.address || "—";

  const rowsHtml = rows
    .map((r, i) => {
      const rowHebrew = describeHebrewDate(parseLocalISODate(r.date));
      return `
      <tr class="${i % 2 === 1 ? "alt" : ""}">
        <td class="marker">◆</td>
        <td class="date-cell">
          <div class="date-hebrew">${rowHebrew.hebrewDate}</div>
          <div class="date-greg">${formatGregorianDate(r.date)}</div>
        </td>
        <td><span class="tag">${escapeHtml(rowLabel(r))}</span></td>
        <td>${escapeHtml(r.category ?? "—")}</td>
        <td>${escapeHtml(r.notes ?? "—")}</td>
        <td class="num">${money(r.debitAmount, r.debitCurrency) || "—"}</td>
        <td class="num">${money(r.creditAmount, r.creditCurrency) || "—"}</td>
      </tr>`;
    })
    .join("");

  const totalsRowHtml = balances.length
    ? balances
        .map((b) => `<div class="total-item"><span>${money(Math.max(b.balance, 0), "")}</span><span class="total-currency">${b.currency}</span></div>`)
        .join("")
    : `<div class="total-item"><span>אין יתרה פתוחה</span></div>`;

  const noticeHtml = org.invoice_body_text
    ? org.invoice_body_text
    : `הננו לפנות לידיעתך ${escapeHtml(title)} בדבר נדרים ונדבות וכו&apos; אשר נדר/נדב במשך ימי השנה ל${escapeHtml(org.org_name)} ועדיין לא שולם`;

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} - ${escapeHtml(contactName)}</title>
<style>
  @import url("https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800&display=swap");

  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
  @page { size: A4; margin: 12mm 10mm; }
  body {
    font-family: "Rubik", Arial, sans-serif;
    color: #2c3428;
    margin: 0;
    padding: 0 34px 34px;
    background: #fff;
    font-size: 13px;
  }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 10px; padding-top: 24px; }
  .org-block { text-align: right; flex: 1 1 auto; min-width: 0; }
  .org-name { font-size: 46px; font-weight: 800; color: #33463a; line-height: 1.1; overflow-wrap: break-word; }
  .org-note { font-size: 12px; color: #6b7568; margin-top: 6px; line-height: 1.25; }
  .logo-frame {
    height: 190px; max-width: 210px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; background: transparent;
  }
  .logo-frame img { max-height: 190px; max-width: 210px; object-fit: contain; }

  .divider { border-top: 2px dashed #cfcabb; margin: 0 0 18px; }

  .doc-date { font-size: 11px; color: #8b9484; margin-bottom: 14px; text-align: left; line-height: 1.6; }

  .salutation { text-align: center; margin-bottom: 18px; }
  .salutation .to-line { font-size: 13px; color: #6b7568; margin-bottom: 4px; }
  .salutation .name-line { font-size: 26px; font-weight: 800; color: #33463a; }

  .meta-col { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; color: #4d5c46; margin-bottom: 18px; text-align: right; }
  .meta-col b { font-weight: 700; color: #33463a; }

  .notice { text-align: center; font-weight: 700; font-size: 13px; line-height: 1.4; color: #33463a; margin: 0 auto 22px; max-width: 620px; }

  .totals-heading { font-size: 12px; font-weight: 700; color: #6b7568; text-align: left; margin-bottom: 8px; }
  .totals-row { display: flex; justify-content: flex-end; gap: 22px; margin-bottom: 26px; flex-wrap: wrap; }
  .total-item { display: flex; align-items: baseline; gap: 3px; font-size: 18px; font-weight: 800; color: #33463a; }
  .total-currency { font-size: 13px; font-weight: 700; color: #7f9a5e; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 26px; overflow: hidden; }
  thead th {
    background: #33463a; color: #f5f4ef; font-size: 11px; font-weight: 600;
    padding: 9px 10px; text-align: right;
  }
  thead th:first-child { border-radius: 0 10px 0 0; width: 24px; }
  thead th:last-child { border-radius: 10px 0 0 0; }
  tbody td { padding: 8px 10px; font-size: 12.5px; border-bottom: 1px solid #eeece4; }
  tbody tr.alt { background: #faf9f5; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:last-child td:first-child { border-radius: 0 0 10px 0; }
  tbody tr:last-child td:last-child { border-radius: 0 0 0 10px; }
  tbody td.num { font-variant-numeric: tabular-nums; }
  tbody td.marker { color: #7f9a5e; font-size: 9px; text-align: center; }
  tbody td.date-cell { padding-top: 4px; padding-bottom: 4px; line-height: 1.05; }
  .date-hebrew { font-size: 9px; color: #7f9a5e; }
  .date-greg { font-size: 11px; }
  .tag {
    display: inline-block; font-size: 10.5px; font-weight: 600; padding: 2px 8px; border-radius: 20px;
    background: #eef1e7; color: #4d5c46;
  }

  .signature { margin-top: 10px; font-size: 12.5px; line-height: 1.6; }
  .footer-note { margin-top: 34px; padding-top: 12px; border-top: 1px solid #eeece4; font-size: 10.5px; color: #a3a89c; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <div class="org-block">
      <div class="org-name">${escapeHtml(org.org_name)}</div>
      ${org.report_header_note ? `<div class="org-note">${org.report_header_note}</div>` : ""}
    </div>
    <div class="logo-frame">
      ${org.logo_url ? `<img src="${escapeHtml(org.logo_url)}" alt="${escapeHtml(org.org_name)}" />` : ""}
    </div>
  </div>

  <div class="divider"></div>

  <div class="doc-date">
    <div>תאריך הפקה: ${generatedDate} ${generatedTime}</div>
    <div>${genHebrewLine}</div>
  </div>

  <div class="salutation">
    <div class="to-line">לכבוד ידידנו הר״ר</div>
    <div class="name-line">${escapeHtml(contactName)}${contact.city ? ` - ${escapeHtml(contact.city)}` : ""}</div>
  </div>

  <div class="meta-col">
    <div><b>מס&apos; טלפון:</b> ${escapeHtml(contact.phone || "—")}</div>
    <div><b>כתובת:</b> ${escapeHtml(addressFull)}</div>
    <div><b>הערות:</b> ${escapeHtml(notesText)}</div>
  </div>

  <div class="notice">${noticeHtml}</div>

  <div class="totals-heading">סך כל החייבים שלא שולמו:</div>
  <div class="totals-row">${totalsRowHtml}</div>

  <table>
    <thead><tr><th></th><th>תאריך</th><th>סוג</th><th>עבור</th><th>הערות</th><th>התחייבות</th><th>תשלום</th></tr></thead>
    <tbody>${rowsHtml || `<tr><td colspan="7" style="text-align:center;padding:16px;">אין רשומות</td></tr>`}</tbody>
  </table>

  ${org.report_signature ? `<div class="signature">${org.report_signature}</div>` : ""}
  <div class="footer-note">מסמך זה הופק אוטומטית ממערכת ניהול התרומות</div>
</body>
</html>`;
}
