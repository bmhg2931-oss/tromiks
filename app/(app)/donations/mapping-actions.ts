"use server";

import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { guessFieldForHeader, guessFieldFromSamples, matchPaymentMethodSynonym, phoneKey } from "@/lib/donationImportFields";
import { PAY_METHODS, type DonationImportSource, type DonationRecordType } from "@/lib/types";
import { createDonation } from "@/app/(app)/donations/actions";
import { createPledge, createPledgeWithPayment } from "@/app/(app)/donations/pledge-actions";

// שורת דוגמה להורדה כתבנית - נצרך ע"י ExportButton.tsx הקיים (שכבר יודע לכתוב XLSX
// בצד לקוח מ-rows שמגיעים מהשרת), בלי לבנות מנגנון כתיבת קובץ נפרד
export async function getDonationImportTemplateRows(): Promise<{ ok: boolean; rows?: Record<string, unknown>[] }> {
  return {
    ok: true,
    rows: [
      { "תאריך": "01/01/2026", "סכום": "180", "שם תורם": "ישראל ישראלי", "טלפון": "0501234567", "אמצעי תשלום": "מזומן", "מטבע": "", "הערה": "" },
    ],
  };
}

export type ParsedDonationsFile = {
  needsSheetSelection: false;
  headers: string[];
  rows: Record<string, string>[];
  guessedMapping: Record<string, string>;
};

export type SheetSelectionNeeded = { needsSheetSelection: true; sheetNames: string[] };

// זהה בצורתו ל-parseContactsFile ב-settings/import-actions.ts
export async function parseDonationsFile(formData: FormData): Promise<ParsedDonationsFile | SheetSelectionNeeded> {
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("לא נבחר קובץ");
  const requestedSheet = formData.get("sheetName") as string | null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });

  if (!requestedSheet && workbook.SheetNames.length > 1) {
    return { needsSheetSelection: true, sheetNames: workbook.SheetNames };
  }

  const sheetName = requestedSheet ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("הגיליון המבוקש לא נמצא בקובץ");

  const hasHeaderRow = formData.get("hasHeaderRow") !== "false";

  let headers: string[];
  let rows: Record<string, string>[];

  if (hasHeaderRow) {
    const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (raw.length === 0) throw new Error("הגיליון ריק או שלא זוהו בו נתונים");
    headers = Object.keys(raw[0]);
    rows = raw.map((r) => {
      const row: Record<string, string> = {};
      for (const h of headers) row[h] = String(r[h] ?? "").trim();
      return row;
    });
  } else {
    const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (raw.length === 0) throw new Error("הגיליון ריק או שלא זוהו בו נתונים");
    const colCount = Math.max(...raw.map((r) => r.length));
    headers = Array.from({ length: colCount }, (_, i) => `עמודה ${i + 1}`);
    rows = raw.map((r) => {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = String(r[i] ?? "").trim();
      });
      return row;
    });
  }

  const guessedMapping: Record<string, string> = {};
  for (const h of headers) {
    let guess = guessFieldForHeader(h);
    if (guess === "skip") {
      const samples = rows.slice(0, 15).map((r) => r[h]);
      guess = guessFieldFromSamples(samples) ?? "skip";
    }
    guessedMapping[h] = guess;
  }

  return { needsSheetSelection: false, headers, rows, guessedMapping };
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/["'׳’.]/g, "");
}

// רשת ביטחון לפני החלת כלל שיוך קבוע אוטומטית: אם יש שם תורם בשורה המיובאת, בודקים
// שהוא מכיל לפחות טוקן אחד משם איש הקשר של הכלל - אם אין שם תורם בכלל, אין מספיק
// מידע להשוואה ולכן לא חוסמים (סומכים על הכלל)
function namesLikelyMatch(donorName: string | null | undefined, firstName: string, lastName: string): boolean {
  if (!donorName || !donorName.trim()) return true;
  const donor = normalizeName(donorName);
  return [firstName, lastName]
    .map(normalizeName)
    .filter((t) => t.length > 1)
    .some((t) => donor.includes(t));
}

export type ParsedDonationRow = {
  donor_name: string | null;
  phone: string | null;
  amount: number | null;
  currency: string;
  donation_date: string | null;
  payment_method_raw: string | null;
  record_type: DonationRecordType;
  category: string | null;
  payment_hub: string | null;
  pledge_type: string | null;
  handler: string | null;
  status: string | null;
  bank_name: string | null;
  branch_number: string | null;
  account_number: string | null;
  check_number: string | null;
  check_date: string | null;
  notes: string | null;
  raw: Record<string, string>;
};

type ContactMatch = {
  phone_key: string | null;
  match_status: "unmatched" | "ambiguous" | "matched";
  matched_contact_id: string | null;
  match_source: "auto_suffix" | "permanent_rule" | null;
};

// לכל שורה: קודם בודקים כלל שיוך קבוע (גלובלי, חוצה מקורות), ואח"כ נופלים ל-6
// הספרות האחרונות מול אנשי קשר קיימים (בזיכרון, לא query SQL עם אינדקס ביטוי -
// עקבי עם איך שחיפוש טלפון קיים כבר עובד במקומות אחרים באפליקציה)
export async function matchContactsForRows(rows: ParsedDonationRow[]): Promise<ContactMatch[]> {
  const supabase = await createClient();

  const { data: rules } = await supabase.from("donation_phone_mapping_rules").select("phone_key, contact_id");
  const ruleMap = new Map((rules ?? []).map((r) => [r.phone_key as string, r.contact_id as string]));

  const { data: contacts } = await fetchAllRows<{ id: string; first_name: string; last_name: string; phone: string }>(() =>
    supabase.from("contacts").select("id, first_name, last_name, phone").is("deleted_at", null)
  );

  const contactById = new Map((contacts ?? []).map((c) => [c.id, c]));
  const byKey = new Map<string, { id: string; first_name: string; last_name: string }[]>();
  for (const c of contacts ?? []) {
    const key = phoneKey(c.phone);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(c);
  }

  return rows.map((row): ContactMatch => {
    const key = row.phone ? phoneKey(row.phone) : "";
    if (!key) return { phone_key: null, match_status: "unmatched", matched_contact_id: null, match_source: null };

    const ruleContactId = ruleMap.get(key);
    if (ruleContactId) {
      const contact = contactById.get(ruleContactId);
      if (!contact || namesLikelyMatch(row.donor_name, contact.first_name, contact.last_name)) {
        return { phone_key: key, match_status: "matched", matched_contact_id: ruleContactId, match_source: "permanent_rule" };
      }
      return { phone_key: key, match_status: "ambiguous", matched_contact_id: null, match_source: null };
    }

    const candidates = byKey.get(key) ?? [];
    if (candidates.length === 0) return { phone_key: key, match_status: "unmatched", matched_contact_id: null, match_source: null };
    if (candidates.length === 1) {
      return { phone_key: key, match_status: "matched", matched_contact_id: candidates[0].id, match_source: "auto_suffix" };
    }
    return { phone_key: key, match_status: "ambiguous", matched_contact_id: null, match_source: null };
  });
}

// מנחש אמצעי תשלום לכל שורה: קודם מילון נרדפות (זול, ללא קריאת רשת), ואז - רק לערכים
// שלא זוהו - קריאת AI אחת לכל הבאטש (לא per-row, כדי לא להכפיל קריאות API). התוצאה
// היא תמיד ניחוש בלבד שמוצג למשתמש לאישור בתצוגה המקדימה - לעולם לא נשמר ישירות
export async function matchPaymentMethods(rawValues: (string | null)[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  const unresolved = new Set<string>();

  for (const raw of rawValues) {
    if (!raw || !raw.trim()) continue;
    if (raw in result) continue;
    const guess = matchPaymentMethodSynonym(raw);
    if (guess) result[raw] = guess;
    else unresolved.add(raw);
  }

  if (unresolved.size === 0) return result;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    for (const raw of unresolved) result[raw] = null;
    return result;
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const values = Array.from(unresolved);
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `אלה ערכי "אמצעי תשלום" חופשיים מקובץ ייבוא תרומות. לכל ערך, מצא את ההתאמה הכי קרובה מהרשימה הסגורה הבאה, או null אם אין התאמה סבירה בכלל:
רשימה סגורה: ${JSON.stringify(PAY_METHODS)}
ערכים לסיווג: ${JSON.stringify(values)}
החזר אך ורק אובייקט JSON תקין (בלי טקסט נוסף, בלי code fence) שממפה כל ערך מקורי לערך המדויק מהרשימה הסגורה או ל-null: {"<ערך מקורי>": "<ערך מהרשימה>"|null, ...}`,
        },
      ],
    });
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const jsonMatch = textBlock?.text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? (JSON.parse(jsonMatch[0]) as Record<string, string | null>) : {};
    for (const raw of unresolved) {
      const guess = parsed[raw];
      result[raw] = typeof guess === "string" && (PAY_METHODS as string[]).includes(guess) ? guess : null;
    }
  } catch {
    for (const raw of unresolved) result[raw] = null;
  }

  return result;
}

export async function createImportBatch(source: DonationImportSource, filename: string | null): Promise<{ ok: boolean; batchId?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("donation_import_batches")
    .insert({ source, filename, created_by: user?.id ?? null })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, batchId: data.id };
}

// כותב את השורות ל-staging מיד אחרי הפענוח (לא רק בזיכרון) - כולל שיוך אוטומטי,
// ניחוש אמצעי תשלום, וזיהוי כפילויות מול תרומות קיימות - כדי שהלשונית "טרם שויכו"
// תשקף מצב אמיתי גם אחרי רענון/סגירת חלון
export async function saveImportRows(
  batchId: string,
  rows: ParsedDonationRow[]
): Promise<{ ok: boolean; error?: string; rowIds?: string[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const matches = await matchContactsForRows(rows);
  const paymentMethodMap = await matchPaymentMethods(rows.map((r) => r.payment_method_raw));

  const matchedContactIds = Array.from(new Set(matches.map((m) => m.matched_contact_id).filter((id): id is string => Boolean(id))));
  const { data: existingDonations } =
    matchedContactIds.length > 0
      ? await supabase.from("donations").select("contact_id, amount, currency, donation_date").in("contact_id", matchedContactIds).is("deleted_at", null)
      : { data: [] as { contact_id: string; amount: number; currency: string; donation_date: string }[] };

  const payload = rows.map((row, i) => {
    const match = matches[i];
    const isDuplicate = (existingDonations ?? []).some(
      (d) =>
        d.contact_id === match.matched_contact_id &&
        Number(d.amount) === row.amount &&
        d.currency === row.currency &&
        d.donation_date === row.donation_date
    );
    return {
      batch_id: batchId,
      raw: row.raw,
      donor_name: row.donor_name,
      phone: row.phone,
      phone_key: match.phone_key,
      amount: row.amount,
      currency: row.currency,
      donation_date: row.donation_date,
      payment_method_raw: row.payment_method_raw,
      payment_method: row.payment_method_raw ? paymentMethodMap[row.payment_method_raw] ?? null : null,
      record_type: row.record_type,
      category: row.category,
      payment_hub: row.payment_hub,
      pledge_type: row.pledge_type,
      handler: row.handler,
      status: row.status,
      bank_name: row.bank_name,
      branch_number: row.branch_number,
      account_number: row.account_number,
      check_number: row.check_number,
      check_date: row.check_date,
      notes: row.notes,
      match_status: match.match_status,
      matched_contact_id: match.matched_contact_id,
      match_source: match.match_source,
      possible_duplicate: isDuplicate,
      created_by: user?.id ?? null,
    };
  });

  const { data, error } = await supabase.from("donation_import_rows").insert(payload).select("id");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/donations/mapping");
  return { ok: true, rowIds: (data ?? []).map((r) => r.id) };
}

export type ImportRowEditableFields = Partial<{
  donation_date: string;
  amount: number;
  currency: string;
  payment_method: string;
  record_type: DonationRecordType;
  category: string | null;
  payment_hub: string | null;
  pledge_type: string | null;
  handler: string | null;
  status: string | null;
  bank_name: string | null;
  branch_number: string | null;
  account_number: string | null;
  check_number: string | null;
  check_date: string | null;
  notes: string | null;
  match_status: "skipped";
}>;

// עריכת שדות בודדים בתצוגה המקדימה (תאריך/סכום/מטבע/אמצעי תשלום/סוג רשומה/הערה),
// או ביטול שורה (match_status='skipped') - נשמר מיד לכל שינוי, כך ש-commitImportRows
// שקורא ישירות מה-DB תמיד יראה את הערכים העדכניים שאושרו בתצוגה המקדימה
export async function updateImportRow(rowId: string, patch: ImportRowEditableFields): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("donation_import_rows").update(patch).eq("id", rowId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// שיוך/תיקון ידני לשורה בודדת. permanent=true שומר גם כלל קבוע גלובלי (upsert לפי
// phone_key); permanent=false בודק אם היה כלל קבוע קיים לאותו phone_key - אם כן, זו
// "חריגה חד-פעמית" (one_time_override) מודעת; אם לא, זה פשוט שיוך ידני רגיל (manual)
export async function setRowMatch(
  rowId: string,
  contactId: string,
  options: { permanent: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: row, error: rowError } = await supabase.from("donation_import_rows").select("phone_key").eq("id", rowId).single();
  if (rowError || !row) return { ok: false, error: rowError?.message ?? "שורה לא נמצאה" };

  let matchSource: "permanent_rule" | "manual" | "one_time_override" = "manual";

  if (options.permanent && row.phone_key) {
    const { error: ruleError } = await supabase
      .from("donation_phone_mapping_rules")
      .upsert({ phone_key: row.phone_key, contact_id: contactId, created_by: user?.id ?? null }, { onConflict: "phone_key" });
    if (ruleError) return { ok: false, error: ruleError.message };
    matchSource = "permanent_rule";
  } else if (row.phone_key) {
    const { data: existingRule } = await supabase.from("donation_phone_mapping_rules").select("id").eq("phone_key", row.phone_key).maybeSingle();
    matchSource = existingRule ? "one_time_override" : "manual";
  }

  const { error } = await supabase
    .from("donation_import_rows")
    .update({ matched_contact_id: contactId, match_status: "matched", match_source: matchSource })
    .eq("id", rowId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/donations/mapping");
  return { ok: true };
}

export type CommitRowError = { rowId: string; error: string };

function setIfPresent(fd: FormData, key: string, value: string | null | undefined) {
  if (value) fd.set(key, value);
}

// per-row, לא all-or-nothing: שורה שנכשלת לא חוסמת את שאר הבאטש, ולא נספרת "יובאה"
// (created_donation_id/created_pledge_id נשארים null) כדי שלא תישמר פעמיים בניסיון חוזר
export async function commitImportRows(rowIds: string[]): Promise<{ succeeded: string[]; failed: CommitRowError[] }> {
  const supabase = await createClient();
  const succeeded: string[] = [];
  const failed: CommitRowError[] = [];

  const { data: rows, error: fetchError } = await supabase.from("donation_import_rows").select("*").in("id", rowIds);
  if (fetchError || !rows) {
    return { succeeded: [], failed: rowIds.map((rowId) => ({ rowId, error: fetchError?.message ?? "שגיאה בטעינת השורות" })) };
  }

  for (const row of rows) {
    if (row.match_status === "imported") continue; // כבר יובאה בעבר - לא מייבאים פעמיים, ולא נספר ככישלון
    if (row.match_status !== "matched" || !row.matched_contact_id) {
      failed.push({ rowId: row.id, error: "השורה טרם שויכה לאיש קשר" });
      continue;
    }

    try {
      const recordType = row.record_type as DonationRecordType;
      const notes = row.notes || undefined;
      let donationId: string | null = null;
      let pledgeId: string | null = null;

      if (recordType === "payment_only") {
        const fd = new FormData();
        fd.set("contact_id", row.matched_contact_id);
        fd.set("amount", String(row.amount ?? 0));
        fd.set("currency", row.currency);
        fd.set("donation_date", row.donation_date ?? "");
        fd.set("payment_method", row.payment_method || "מזומן");
        fd.set("source", "ייבוא קובץ");
        setIfPresent(fd, "notes", notes);
        setIfPresent(fd, "purpose", row.category);
        setIfPresent(fd, "payment_hub", row.payment_hub);
        setIfPresent(fd, "status", row.status);
        setIfPresent(fd, "bank_name", row.bank_name);
        setIfPresent(fd, "branch_number", row.branch_number);
        setIfPresent(fd, "account_number", row.account_number);
        setIfPresent(fd, "check_number", row.check_number);
        setIfPresent(fd, "check_date", row.check_date);
        setIfPresent(fd, "nedarim_transaction_id", row.nedarim_transaction_id);
        const result = await createDonation(null, fd);
        if (!result.ok) throw new Error(result.error ?? "שגיאה ביצירת התרומה");
        donationId = result.donationId ?? null;
      } else if (recordType === "pledge") {
        const fd = new FormData();
        fd.set("contact_id", row.matched_contact_id);
        fd.set("amount", String(row.amount ?? 0));
        fd.set("currency", row.currency);
        fd.set("pledge_date", row.donation_date ?? "");
        setIfPresent(fd, "details", notes);
        setIfPresent(fd, "category", row.category);
        setIfPresent(fd, "payment_hub", row.payment_hub);
        setIfPresent(fd, "pledge_type", row.pledge_type);
        setIfPresent(fd, "handler", row.handler);
        const result = await createPledge(null, fd);
        if (!result.ok) throw new Error(result.error ?? "שגיאה ביצירת ההתחייבות");
        pledgeId = result.pledgeId ?? null;
      } else {
        // pledge_and_payment: הסכום המיובא משמש גם כסכום ההתחייבות וגם כסכום התשלום
        // (התחייבות ששולמה במלואה - ר' הערה ב-Part B של התכנון)
        const fd = new FormData();
        fd.set("contact_id", row.matched_contact_id);
        fd.set("amount", String(row.amount ?? 0));
        fd.set("currency", row.currency);
        fd.set("pledge_date", row.donation_date ?? "");
        fd.set("payment_amount", String(row.amount ?? 0));
        fd.set("payment_currency", row.currency);
        fd.set("payment_date", row.donation_date ?? "");
        fd.set("payment_method", row.payment_method || "מזומן");
        fd.set("source", "ייבוא קובץ");
        setIfPresent(fd, "details", notes);
        setIfPresent(fd, "category", row.category);
        setIfPresent(fd, "payment_hub", row.payment_hub);
        setIfPresent(fd, "pledge_type", row.pledge_type);
        setIfPresent(fd, "handler", row.handler);
        setIfPresent(fd, "status", row.status);
        setIfPresent(fd, "bank_name", row.bank_name);
        setIfPresent(fd, "branch_number", row.branch_number);
        setIfPresent(fd, "account_number", row.account_number);
        setIfPresent(fd, "check_number", row.check_number);
        setIfPresent(fd, "check_date", row.check_date);
        setIfPresent(fd, "nedarim_transaction_id", row.nedarim_transaction_id);
        const result = await createPledgeWithPayment(null, fd);
        if (!result.ok) throw new Error(result.error ?? "שגיאה ביצירת ההתחייבות והתשלום");
        pledgeId = result.pledgeId ?? null;
        donationId = result.donationId ?? null;
      }

      const { error: updateError } = await supabase
        .from("donation_import_rows")
        .update({ match_status: "imported", created_donation_id: donationId, created_pledge_id: pledgeId })
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);

      succeeded.push(row.id);
    } catch (e) {
      failed.push({ rowId: row.id, error: e instanceof Error ? e.message : "שגיאה לא ידועה" });
    }
  }

  revalidatePath("/donations/mapping");
  revalidatePath("/donations");
  return { succeeded, failed };
}

// גרסה בעמוד קטן וחסום, לאותה סיבה בדיוק כמו fetchAndStageNedarimHistoryPage
// ב-nedarim-sync-actions.ts: אישור של אלפי שורות משויכות בקריאה סינכרונית אחת
// עלול לחרוג מ-timeout של 10 שניות ל-invocation (Vercel Hobby). הלקוח (ר'
// DonationMappingTab.tsx) קורא לפונקציה הזו בלולאה עד ש-remaining=0, במקום
// לחייב את המשתמש לדפדף עמוד-עמוד ולאשר ידנית כל 30 שורות בנפרד
export async function commitMatchedRowsBatch(
  source: DonationImportSource,
  limit: number
): Promise<{ succeeded: string[]; failed: CommitRowError[]; remaining: number }> {
  const supabase = await createClient();

  const { data: batch } = await supabase
    .from("donation_import_rows")
    .select("id, donation_import_batches!inner(source)")
    .eq("donation_import_batches.source", source)
    .eq("match_status", "matched")
    .order("created_at", { ascending: true })
    .limit(limit);

  const rowIds = (batch ?? []).map((r) => r.id as string);
  if (rowIds.length === 0) return { succeeded: [], failed: [], remaining: 0 };

  const { succeeded, failed } = await commitImportRows(rowIds);

  const { count } = await supabase
    .from("donation_import_rows")
    .select("id, donation_import_batches!inner(source)", { count: "exact", head: true })
    .eq("donation_import_batches.source", source)
    .eq("match_status", "matched");

  return { succeeded, failed, remaining: count ?? 0 };
}
