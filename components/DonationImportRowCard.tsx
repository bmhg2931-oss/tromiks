"use client";

import { useState } from "react";
import { setRowMatch, updateImportRow } from "@/app/(app)/donations/mapping-actions";
import ContactAutocomplete from "./ContactAutocomplete";
import NewContactModal from "./NewContactModal";
import {
  ALL_CURRENCIES,
  DONATION_STATUSES,
  PAY_METHODS,
  PAYMENT_HUBS,
  PLEDGE_TYPES,
  RECORD_TYPE_LABELS,
  availableRecordTypes,
  type DonationImportRow,
  type DonationImportSource,
  type DonationRecordType,
} from "@/lib/types";

// מספר עמודות הטבלה ב-DonationImportRowCardHeader למטה - colSpan של שורות
// ההרחבה (עריכה/שיוך) חייב להישאר זהה למספר ה-<th>-ים שם
export const DONATION_IMPORT_ROW_COLUMN_COUNT = 8;

export function DonationImportRowCardHeader() {
  return (
    <tr className="text-right text-xs text-ink-soft border-b-2 border-line sticky top-0 z-10 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
      <th className="p-2.5 whitespace-nowrap">תאריך</th>
      <th className="p-2.5">שם תורם</th>
      <th className="p-2.5 whitespace-nowrap">טלפון</th>
      <th className="p-2.5 whitespace-nowrap">סכום</th>
      <th className="p-2.5 whitespace-nowrap">אמצעי תשלום</th>
      <th className="p-2.5 whitespace-nowrap">סוג רשומה</th>
      <th className="p-2.5">שיוך</th>
      <th className="p-2.5"></th>
    </tr>
  );
}

// defaultExpanded=true (המצב במודל הייבוא החד-פעמי, ר' DonationImportModal.tsx) -
// שם רואים תמיד רק את השורות מהקובץ הנוכחי וצריך לעבור על כולן בכל מקרה.
// defaultExpanded=false (המצב ברשימה הקבועה, ר' DonationMappingTab.tsx) - שם
// יכולות להיות מאות שורות מצטברות, ופתיחת כולן בבת אחת הופכת את המסך למסורבל
export default function DonationImportRowCard({
  row,
  source,
  onChange,
  onMatched,
  defaultExpanded = true,
}: {
  row: DonationImportRow;
  source: DonationImportSource;
  onChange: (patch: Partial<DonationImportRow>) => void;
  onMatched: () => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [reassigning, setReassigning] = useState(false);
  const [permanent, setPermanent] = useState(false);
  const [savingMatch, setSavingMatch] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const contactName = row.contacts ? `${row.contacts.first_name} ${row.contacts.last_name}` : null;
  const recordTypeOptions = availableRecordTypes(source);
  const isPledgeType = row.record_type === "pledge" || row.record_type === "pledge_and_payment";
  const showCheckFields = row.payment_method === "צ'ק" || row.payment_method === "העברה בנקאית";

  function patchField<K extends keyof DonationImportRow>(key: K, value: DonationImportRow[K]) {
    onChange({ [key]: value } as Partial<DonationImportRow>);
    updateImportRow(row.id, { [key]: value } as Parameters<typeof updateImportRow>[1]);
  }

  async function handlePick(contactId: string) {
    setSavingMatch(true);
    const result = await setRowMatch(row.id, contactId, { permanent });
    setSavingMatch(false);
    if (result.ok) {
      setReassigning(false);
      onMatched();
    }
  }

  const rowBg = row.match_status === "skipped" ? "opacity-40" : row.match_status === "ambiguous" ? "bg-[#fdf6f6]" : "";

  return (
    <>
      <tr className={`border-b border-[#e6e3da] hover:bg-parchment/50 transition ${rowBg}`}>
        <td className="p-2.5 whitespace-nowrap text-sm text-ink-soft">{row.donation_date ?? "—"}</td>
        <td className="p-2.5 text-sm font-semibold max-w-[12rem] truncate">{row.donor_name ?? "—"}</td>
        <td className="p-2.5 whitespace-nowrap text-sm text-ink-soft">{row.phone ?? "—"}</td>
        <td className="p-2.5 whitespace-nowrap text-sm font-semibold">
          {row.currency}
          {row.amount != null ? row.amount.toLocaleString("he-IL") : "—"}
          {row.possible_duplicate && <div className="text-xs text-wine font-semibold">כפילות אפשרית</div>}
        </td>
        <td className="p-2.5 whitespace-nowrap text-sm text-ink-soft">{row.payment_method || row.payment_method_raw || "—"}</td>
        <td className="p-2.5 whitespace-nowrap text-sm text-ink-soft">{RECORD_TYPE_LABELS[row.record_type]}</td>
        <td className="p-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            {row.match_status === "matched" && contactName && !reassigning && (
              <>
                <span className="text-xs bg-[#eef1e7] text-[#4a6b34] px-2 py-1 rounded-full font-semibold whitespace-nowrap">משויך: {contactName}</span>
                <button type="button" onClick={() => setReassigning(true)} className="text-xs text-ink-soft underline whitespace-nowrap">
                  שנה שיוך
                </button>
              </>
            )}
            {row.match_status !== "matched" && !reassigning && (
              <>
                <span className="text-xs text-wine font-semibold whitespace-nowrap">
                  {row.match_status === "ambiguous" ? "כמה התאמות אפשריות" : "טרם שויך"}
                </span>
                <button type="button" onClick={() => setReassigning(true)} className="text-xs text-brass-deep underline whitespace-nowrap">
                  שייך
                </button>
              </>
            )}
            {row.match_status !== "skipped" && (
              <button
                type="button"
                onClick={() => {
                  onChange({ match_status: "skipped" });
                  updateImportRow(row.id, { match_status: "skipped" });
                }}
                className="text-xs text-ink-soft underline whitespace-nowrap"
              >
                בטל שורה
              </button>
            )}
          </div>
        </td>
        <td className="p-2.5 whitespace-nowrap">
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs text-ink-soft underline">
            {expanded ? "סגירה" : "פרטים"}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-[#e6e3da] bg-parchment/30">
          <td colSpan={DONATION_IMPORT_ROW_COLUMN_COUNT} className="p-3 space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div>
                <label className="block text-xs text-ink-soft mb-0.5">תאריך</label>
                <input
                  type="date"
                  defaultValue={row.donation_date ?? ""}
                  onBlur={(e) => {
                    onChange({ donation_date: e.target.value || null });
                    updateImportRow(row.id, { donation_date: e.target.value || undefined });
                  }}
                  className="in w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-ink-soft mb-0.5">סכום</label>
                <div className="flex gap-1">
                  <select
                    defaultValue={row.currency}
                    onChange={(e) => {
                      onChange({ currency: e.target.value });
                      updateImportRow(row.id, { currency: e.target.value });
                    }}
                    className="in w-14 text-sm"
                  >
                    {ALL_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={row.amount ?? ""}
                    onBlur={(e) => {
                      const amount = Number(e.target.value) || 0;
                      onChange({ amount });
                      updateImportRow(row.id, { amount });
                    }}
                    className="in w-full text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-ink-soft mb-0.5">אמצעי תשלום</label>
                <select
                  defaultValue={row.payment_method ?? ""}
                  onChange={(e) => {
                    onChange({ payment_method: e.target.value });
                    updateImportRow(row.id, { payment_method: e.target.value });
                  }}
                  className="in w-full text-sm"
                >
                  <option value="">— בחר —</option>
                  {PAY_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                {row.payment_method_raw && !row.payment_method && (
                  <div className="text-xs text-wine mt-0.5">מקור: &quot;{row.payment_method_raw}&quot; - לא זוהה אוטומטית</div>
                )}
              </div>
              <div>
                <label className="block text-xs text-ink-soft mb-0.5">סוג רשומה</label>
                <select
                  defaultValue={row.record_type}
                  onChange={(e) => {
                    const record_type = e.target.value as DonationRecordType;
                    onChange({ record_type });
                    updateImportRow(row.id, { record_type });
                  }}
                  className="in w-full text-sm"
                >
                  {recordTypeOptions.map((rt) => (
                    <option key={rt} value={rt}>
                      {RECORD_TYPE_LABELS[rt]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(row.nedarim_transaction_id || row.stripe_payment_intent_id || row.stripe_customer_id) && (
              <div className="text-xs text-ink-soft space-x-3 space-x-reverse">
                {row.nedarim_transaction_id && (
                  <span>
                    מזהה עסקה (נדרים פלוס): <span className="font-mono">{row.nedarim_transaction_id}</span>
                  </span>
                )}
                {row.stripe_payment_intent_id && (
                  <span>
                    מזהה עסקה (Stripe): <span className="font-mono">{row.stripe_payment_intent_id}</span>
                  </span>
                )}
                {row.stripe_customer_id && (
                  <span>
                    מזהה לקוח (Stripe): <span className="font-mono">{row.stripe_customer_id}</span>
                  </span>
                )}
              </div>
            )}

            <button type="button" onClick={() => setShowExtra((v) => !v)} className="text-xs text-ink-soft underline">
              {showExtra ? "הסתר שדות נוספים" : "שדות נוספים (קטגוריה, מוקד תשלום, סטטוס...)"}
            </button>

            {showExtra && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm border-t border-line pt-2">
                <div>
                  <label className="block text-xs text-ink-soft mb-0.5">קטגוריה</label>
                  <input
                    type="text"
                    defaultValue={row.category ?? ""}
                    onBlur={(e) => patchField("category", e.target.value || null)}
                    className="in w-full text-sm"
                    placeholder="לשיוך לקמפיין"
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-soft mb-0.5">מוקד תשלום</label>
                  <select defaultValue={row.payment_hub ?? ""} onChange={(e) => patchField("payment_hub", e.target.value || null)} className="in w-full text-sm">
                    <option value="">—</option>
                    {PAYMENT_HUBS.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-soft mb-0.5">סטטוס</label>
                  <select defaultValue={row.status ?? ""} onChange={(e) => patchField("status", e.target.value || null)} className="in w-full text-sm">
                    <option value="">— ברירת מחדל —</option>
                    {DONATION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                {isPledgeType && (
                  <>
                    <div>
                      <label className="block text-xs text-ink-soft mb-0.5">סוג התחייבות</label>
                      <select defaultValue={row.pledge_type ?? ""} onChange={(e) => patchField("pledge_type", e.target.value || null)} className="in w-full text-sm">
                        <option value="">— ברירת מחדל —</option>
                        {PLEDGE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-ink-soft mb-0.5">מטפל</label>
                      <input type="text" defaultValue={row.handler ?? ""} onBlur={(e) => patchField("handler", e.target.value || null)} className="in w-full text-sm" />
                    </div>
                  </>
                )}
                {showCheckFields && (
                  <>
                    <div>
                      <label className="block text-xs text-ink-soft mb-0.5">בנק</label>
                      <input type="text" defaultValue={row.bank_name ?? ""} onBlur={(e) => patchField("bank_name", e.target.value || null)} className="in w-full text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-ink-soft mb-0.5">סניף</label>
                      <input type="text" defaultValue={row.branch_number ?? ""} onBlur={(e) => patchField("branch_number", e.target.value || null)} className="in w-full text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-ink-soft mb-0.5">מספר חשבון</label>
                      <input type="text" defaultValue={row.account_number ?? ""} onBlur={(e) => patchField("account_number", e.target.value || null)} className="in w-full text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-ink-soft mb-0.5">מספר שיק</label>
                      <input type="text" defaultValue={row.check_number ?? ""} onBlur={(e) => patchField("check_number", e.target.value || null)} className="in w-full text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-ink-soft mb-0.5">תאריך שיק</label>
                      <input type="date" defaultValue={row.check_date ?? ""} onBlur={(e) => patchField("check_date", e.target.value || null)} className="in w-full text-sm" />
                    </div>
                  </>
                )}
              </div>
            )}
          </td>
        </tr>
      )}

      {reassigning && (
        <tr className="border-b border-[#e6e3da] bg-parchment/30">
          <td colSpan={DONATION_IMPORT_ROW_COLUMN_COUNT} className="p-3 space-y-2">
            <ContactAutocomplete onSelect={(c) => handlePick(c.id)} />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                <input type="checkbox" checked={permanent} onChange={(e) => setPermanent(e.target.checked)} />
                {row.phone_key && row.stripe_customer_id
                  ? "שמור כשיוך קבוע (לפי טלפון ומזהה הלקוח ב-Stripe) - יחול על ייבואים עתידיים"
                  : row.stripe_customer_id
                    ? "שמור כשיוך קבוע למזהה הלקוח הזה ב-Stripe (אין טלפון בעסקה) - יחול על ייבואים עתידיים"
                    : "שמור כשיוך קבוע לטלפון זה (יחול על ייבואים עתידיים מכל המקורות)"}
              </label>
              <div className="flex items-center gap-2">
                <NewContactModal />
                <button type="button" onClick={() => setReassigning(false)} className="text-xs text-ink-soft underline">
                  ביטול
                </button>
              </div>
            </div>
            {savingMatch && <div className="text-xs text-ink-soft">שומר...</div>}
          </td>
        </tr>
      )}
    </>
  );
}
