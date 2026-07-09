"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { guessFieldForHeader, guessFieldFromSamples } from "@/lib/contactImportFields";
import { EMAIL_RE, stripLeadingZeros } from "@/lib/validation";

export type ParsedImportFile = {
  needsSheetSelection: false;
  headers: string[];
  rows: Record<string, string>[];
  guessedMapping: Record<string, string>;
};

export type SheetSelectionNeeded = {
  needsSheetSelection: true;
  sheetNames: string[];
};

export async function parseContactsFile(
  formData: FormData
): Promise<ParsedImportFile | SheetSelectionNeeded> {
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

function buildValue(field: string, raw: string): unknown {
  if (field === "tags") {
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return raw.trim() || null;
}

function validateRow(payload: Record<string, unknown>): string | null {
  if (typeof payload.email === "string" && payload.email && !EMAIL_RE.test(payload.email)) {
    return "כתובת אימייל לא תקינה";
  }
  if (typeof payload.email_secondary === "string" && payload.email_secondary && !EMAIL_RE.test(payload.email_secondary)) {
    return "כתובת אימייל נוסף לא תקינה";
  }
  return null;
}

function translateDbError(message: string): string {
  if (message.includes("contacts_status_check")) return "ערך סטטוס לא תקין";
  if (message.includes("contacts_phone_unique") || message.includes("duplicate key")) return "מספר טלפון כפול במסד הנתונים";
  if (message.includes("null value")) return "חסר שדה חובה (שם פרטי / שם משפחה)";
  return `שגיאת שמירה: ${message}`;
}

export type ImportErrorLogEntry = { row: number; reason: string };

export async function importContactsBatch(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
  fieldsToUpdate: string[],
  startRow: number,
  tagsMode: "append" | "overwrite" = "append"
): Promise<{ inserted: number; updated: number; errors: number; errorLog: ImportErrorLogEntry[] }> {
  const supabase = await createClient();
  const phoneHeader = Object.entries(mapping).find(([, field]) => field === "phone")?.[0];
  if (!phoneHeader) throw new Error("יש למפות עמודה לשדה הסלולארי הראשי (מזהה)");

  // כשאין ערך בעמודת הסלולארי הראשי, ננסה למצוא מספר זיהוי חלופי מהעמודות הבאות, לפי סדר עדיפות
  const fallbackPhoneHeaders = ["home_phone", "mobile_secondary", "wife_mobile"]
    .map((f) => Object.entries(mapping).find(([, field]) => field === f)?.[0])
    .filter((h): h is string => Boolean(h));

  let inserted = 0;
  let updated = 0;
  let errors = 0;
  const errorLog: ImportErrorLogEntry[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = startRow + i + 2; // +2: header row is row 1, first data row is row 2

    let phone = (row[phoneHeader] || "").replace(/[^\d]/g, "");
    if (!phone) {
      for (const fbHeader of fallbackPhoneHeaders) {
        const candidate = (row[fbHeader] || "").replace(/[^\d]/g, "");
        if (candidate) {
          phone = candidate;
          break;
        }
      }
    }
    if (!phone) {
      errors++;
      errorLog.push({ row: rowNumber, reason: "לא נמצא מספר טלפון תקין (מזהה) באף אחת מעמודות הטלפון" });
      continue;
    }

    const payload: Record<string, unknown> = {};
    for (const [header, field] of Object.entries(mapping)) {
      if (field === "skip" || field === "phone") continue;
      if (!fieldsToUpdate.includes(field)) continue;
      payload[field] = buildValue(field, row[header] || "");
    }

    const validationError = validateRow(payload);
    if (validationError) {
      errors++;
      errorLog.push({ row: rowNumber, reason: validationError });
      continue;
    }

    // ההתאמה לפי טלפון מתעלמת מ-0 מוביל (אקסל נוטה להשמיט אותו), לכן בודקים גם עם וגם בלי
    const barePhone = stripLeadingZeros(phone);
    const { data: existing } = await supabase
      .from("contacts")
      .select("id, tags")
      .or(`phone.eq.${barePhone},phone.eq.0${barePhone}`)
      .maybeSingle();

    if (existing) {
      // מצב "הוספה" לתגיות: ממזגים עם התגיות הקיימות במקום לדרוס אותן
      if (tagsMode === "append" && Array.isArray(payload.tags)) {
        const merged = new Set([...(existing.tags ?? []), ...(payload.tags as string[])]);
        payload.tags = Array.from(merged);
      }
      // עדכון רשומה קיימת: תאריך ההצטרפות נשאר כפי שהיה, updated_at מתעדכן אוטומטית ע"י trigger קיים
      const { error } = await supabase.from("contacts").update(payload).eq("id", existing.id);
      if (error) {
        errors++;
        errorLog.push({ row: rowNumber, reason: translateDbError(error.message) });
      } else {
        updated++;
      }
    } else {
      // רשומה חדשה: שם משפחה ושיוך למחלקה הם שדות חובה ליצירת איש קשר (שם פרטי אינו חובה), גם אם לא נבחרו לעדכון
      if (!payload.last_name) {
        errors++;
        errorLog.push({ row: rowNumber, reason: "לא נמצא שם משפחה - לא ניתן ליצור איש קשר חדש" });
        continue;
      }
      if (!payload.department) {
        errors++;
        errorLog.push({ row: rowNumber, reason: "לא נמצא שיוך למחלקה - לא ניתן ליצור איש קשר חדש" });
        continue;
      }
      // רשומה חדשה: תאריך ההצטרפות נקבע אוטומטית להיום, וסטטוס ברירת מחדל "פעיל" אם לא סופק
      const joined_date = new Date().toISOString().slice(0, 10);
      if (!payload.status) payload.status = "פעיל";
      const { error } = await supabase.from("contacts").insert({ phone, joined_date, ...payload });
      if (error) {
        errors++;
        errorLog.push({ row: rowNumber, reason: translateDbError(error.message) });
      } else {
        inserted++;
      }
    }
  }

  revalidatePath("/contacts");
  return { inserted, updated, errors, errorLog };
}
