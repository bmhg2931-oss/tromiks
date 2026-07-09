"use client";

import type { ContactHistoryRow } from "@/app/(app)/contacts/history-actions";

function formatGregorianDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function money(amount: number | null, currency: string | null) {
  if (amount == null) return null;
  return `${currency ?? ""}${Number(amount).toLocaleString("he-IL")}`;
}

function activityLine(r: ContactHistoryRow): string {
  const debit = money(r.debitAmount, r.debitCurrency);
  const credit = money(r.creditAmount, r.creditCurrency);
  if (r.recordType === "combined") return `התחייבות ותשלום — חובה ${debit} · זכות ${credit}`;
  if (r.recordType === "pledge") return `התחייבות — ${debit}`;
  return `תשלום — ${credit}`;
}

export default function ContactActivityTab({ rows, error }: { rows: ContactHistoryRow[] | null; error: string | null }) {
  if (error) return <p className="text-sm text-wine">{error}</p>;
  if (!rows) return <p className="text-sm text-ink-soft">טוען פעילות...</p>;

  const today = new Date().toISOString().slice(0, 10);
  const needsAttention = rows.filter((r) => r.followUp && r.followUp <= today);

  return (
    <div className="space-y-5">
      <div className="bg-parchment-deep/50 border border-line rounded-xl p-3 text-xs text-ink-soft">
        גרסה ראשונית: מציגה את הפעילות הקיימת ומדגישה פריטים הדורשים המשך טיפול. ניהול משימות מלא ותזכורות קופצות
        בכל המערכת מתוכננים להמשך.
      </div>

      {needsAttention.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-wine mb-2">דורש תשומת לב</h4>
          <div className="space-y-2">
            {needsAttention.map((r) => (
              <div key={r.id} className="bg-wine/5 border border-wine/30 rounded-xl p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{activityLine(r)}</span>
                  <span className="pill pill-pending text-[11px]">המשך טיפול: {formatGregorianDate(r.followUp!)}</span>
                </div>
                {r.category && <div className="text-xs text-ink-soft mt-1">{r.category}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-xs font-semibold text-ink-soft mb-2">יומן פעילות</h4>
        {rows.length > 0 ? (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-start gap-3 border-b border-line/60 pb-2 last:border-b-0">
                <span className="text-xs text-ink-soft whitespace-nowrap pt-0.5">{formatGregorianDate(r.date)}</span>
                <div className="flex-1 text-sm">
                  {activityLine(r)}
                  {r.category && <span className="text-ink-soft"> · {r.category}</span>}
                  {r.handler && <span className="text-ink-soft"> · מטפל: {r.handler}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">אין פעילות רשומה עדיין</p>
        )}
      </div>
    </div>
  );
}
