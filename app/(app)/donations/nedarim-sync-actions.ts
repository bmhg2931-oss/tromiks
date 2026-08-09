"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NEDARIM_HISTORY_URL, nedarimCurrencyToSymbol, parseNedarimHistoryDate, type NedarimHistoryTransaction } from "@/lib/nedarim";
import { matchContactsForRows, type ParsedDonationRow } from "@/app/(app)/donations/mapping-actions";

// נדרים פלוס מגביל ל-20 קריאות בשעה (ולא רק ל-10 שניות/invocation של Vercel) -
// אז עמוד קטן מדי (200) פשוט ממצה את המכסה השעתית תוך כמה עשרות שניות של לולאת
// client על היסטוריה גדולה, בלי לקדם משמעותית את הסמן. 1000 הוא פשרה: קרוב
// למקסימום המתועד (2000) כדי לצמצם מספר קריאות, אבל עדיין משאיר מרווח סביר
// מול ה-timeout של 10 שניות ל-invocation (התאמת אנשי קשר + insert בבת אחת)
const DEFAULT_MAX_ROWS = 1000;

export type NedarimSyncPageResult = {
  ok: boolean;
  fetched: number;
  staged: number;
  skippedDuplicates: number;
  reachedEnd: boolean;
  // true אם השורה האחרונה בעמוד כבר עברה את untilDate - בהנחת סדר עולה (ר' תיעוד
  // ה-API: "אם לא תסמנו כלום, המערכת תתחיל מהעסקה הראשונה"), משמעות הדבר שכל
  // עמוד עתידי יהיה גם הוא כולו אחרי התאריך, אז אפשר לעצור בלי לבזבז עוד קריאות
  pastCutoff: boolean;
  lastId: string | null;
  error?: string;
};

async function getCursor(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from("nedarim_sync_state").select("last_id").eq("id", true).single();
  return data?.last_id ?? null;
}

async function setCursor(supabase: SupabaseClient, lastId: string) {
  await supabase.from("nedarim_sync_state").update({ last_id: lastId }).eq("id", true);
}

export async function getNedarimSyncStatus(): Promise<{ lastId: string | null; updatedAt: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.from("nedarim_sync_state").select("last_id, updated_at").eq("id", true).single();
  return { lastId: data?.last_id ?? null, updatedAt: data?.updated_at ?? null };
}

// שולף עמוד אחד מ-GetHistoryJson מהסמן המשותף הנוכחי, עושה דה-דופ מול donations
// קיימות לפי nedarim_transaction_id (Nedarim הוא המקור הסמכותי - כפילות מדולגת
// בשקט, לא מעודכנת), וכותב שורות חדשות ל-donation_import_rows עם
// source='נדרים פלוס'. אם סופק untilDate, שורות מאוחרות ממנו לא נשמרות - אבל
// הסמן מתקדם על כל העמוד בכל מקרה (כבר שילמנו את עלות קריאת ה-API)
export async function fetchAndStageNedarimHistoryPage(options: {
  untilDate?: string;
  maxRows?: number;
  useServiceRole?: boolean;
}): Promise<NedarimSyncPageResult> {
  const apiPassword = process.env.NEDARIM_API_PASSWORD;
  const mosad = process.env.NEXT_PUBLIC_NEDARIM_MOSAD;
  if (!apiPassword || !mosad) {
    return {
      ok: false,
      fetched: 0,
      staged: 0,
      skippedDuplicates: 0,
      reachedEnd: false,
      pastCutoff: false,
      lastId: null,
      error: "לא הוגדרו NEDARIM_API_PASSWORD/NEXT_PUBLIC_NEDARIM_MOSAD",
    };
  }

  const supabase = options.useServiceRole ? createAdminClient() : await createClient();
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const cursor = await getCursor(supabase);

  const params = new URLSearchParams({
    Action: "GetHistoryJson",
    MosadId: mosad,
    ApiPassword: apiPassword,
    MaxId: String(maxRows),
  });
  if (cursor) params.set("LastId", cursor);

  let transactions: NedarimHistoryTransaction[];
  try {
    const res = await fetch(`${NEDARIM_HISTORY_URL}?${params.toString()}`);
    if (!res.ok) throw new Error(`שגיאת HTTP ${res.status} משרתי נדרים פלוס`);
    const data = await res.json();
    // חשוב: תגובה שהיא לא מערך (למשל הודעת שגיאה של נדרים פלוס - ApiPassword שגוי,
    // MosadId לא תקין, חריגה ממכסת 20 קריאות/שעה וכו' - שנשלחת לרוב עם סטטוס HTTP
    // 200 ולא כשגיאת HTTP) חייבת להיחשב שגיאה ולא "0 עסקאות, סוף ההיסטוריה" - אחרת
    // השגיאה נבלעת בשקט (בדיוק הבאג שגרם ל"טרם בוצע סנכרון" בלי שום הודעה)
    if (Array.isArray(data)) {
      transactions = data;
    } else if (Array.isArray(data?.data)) {
      transactions = data.data;
    } else {
      const message = typeof (data as { Message?: unknown })?.Message === "string" ? (data as { Message: string }).Message : null;
      if (message && /too many requests/i.test(message)) {
        // לא שגיאת קרדנציאלים - חריגה ממכסת 20 הקריאות לשעה של נדרים פלוס. הסמן
        // כבר נשמר מהקריאות הקודמות, אז אין אובדן מידע - פשוט צריך להמתין
        throw new Error("נדרים פלוס חסם זמנית - חריגה ממכסת 20 בקשות לשעה. הסמן נשמר, אפשר להמשיך בעוד כשעה.");
      }
      throw new Error(`תגובה לא צפויה מנדרים פלוס (יתכן ApiPassword/MosadId שגויים): ${JSON.stringify(data).slice(0, 400)}`);
    }
  } catch (e) {
    return {
      ok: false,
      fetched: 0,
      staged: 0,
      skippedDuplicates: 0,
      reachedEnd: false,
      pastCutoff: false,
      lastId: cursor,
      error: e instanceof Error ? e.message : "שגיאה בשליפה מנדרים פלוס",
    };
  }

  if (transactions.length === 0) {
    return { ok: true, fetched: 0, staged: 0, skippedDuplicates: 0, reachedEnd: true, pastCutoff: false, lastId: cursor };
  }

  const txIds = transactions.map((t) => String(t.TransactionId));
  const { data: existing } = await supabase.from("donations").select("nedarim_transaction_id").in("nedarim_transaction_id", txIds);
  const existingIds = new Set((existing ?? []).map((d) => d.nedarim_transaction_id as string));

  type StagedRow = ParsedDonationRow & { nedarim_transaction_id: string };
  const rowsToStage: StagedRow[] = [];
  let skippedDuplicates = 0;

  for (const t of transactions) {
    const txId = String(t.TransactionId);
    if (existingIds.has(txId)) {
      skippedDuplicates++;
      continue;
    }
    const date = parseNedarimHistoryDate(t.TransactionTime);
    if (options.untilDate && date && date > options.untilDate) continue;

    rowsToStage.push({
      raw: t as unknown as Record<string, string>,
      donor_name: t.ClientName ?? null,
      phone: t.Phone ?? null,
      amount: Number(t.Amount) || null,
      currency: nedarimCurrencyToSymbol(t.Currency) ?? "₪",
      donation_date: date,
      // אין ניחוש אמצעי תשלום נדרש כאן - כל עסקה מ-endpoint זה היא מטבעה עסקת
      // אשראי (ר' payment_method הקבוע למטה), בשונה מייבוא מקובץ כללי
      payment_method_raw: null,
      record_type: "payment_only",
      category: t.Groupe ?? null,
      payment_hub: null,
      pledge_type: null,
      handler: null,
      status: null,
      bank_name: null,
      branch_number: null,
      account_number: null,
      check_number: null,
      check_date: null,
      notes: t.Comments ?? null,
      nedarim_transaction_id: txId,
    });
  }

  let staged = 0;
  if (rowsToStage.length > 0) {
    const { data: batch, error: batchError } = await supabase
      .from("donation_import_batches")
      .insert({ source: "נדרים פלוס", filename: null, created_by: null })
      .select("id")
      .single();
    if (batchError || !batch) {
      return {
        ok: false,
        fetched: transactions.length,
        staged: 0,
        skippedDuplicates,
        reachedEnd: false,
        pastCutoff: false,
        lastId: cursor,
        error: batchError?.message ?? "שגיאה ביצירת באטש ייבוא",
      };
    }

    const matches = await matchContactsForRows(rowsToStage);
    const payload = rowsToStage.map((row, i) => {
      const match = matches[i];
      return {
        batch_id: batch.id,
        raw: row.raw,
        donor_name: row.donor_name,
        phone: row.phone,
        phone_key: match.phone_key,
        amount: row.amount,
        currency: row.currency,
        donation_date: row.donation_date,
        payment_method_raw: null,
        payment_method: "כרטיס אשראי",
        record_type: "payment_only" as const,
        category: row.category,
        notes: row.notes,
        match_status: match.match_status,
        matched_contact_id: match.matched_contact_id,
        match_source: match.match_source,
        possible_duplicate: false,
        nedarim_transaction_id: row.nedarim_transaction_id,
        created_by: null,
      };
    });

    const { data: inserted, error: insertError } = await supabase.from("donation_import_rows").insert(payload).select("id");
    if (insertError) {
      return {
        ok: false,
        fetched: transactions.length,
        staged: 0,
        skippedDuplicates,
        reachedEnd: false,
        pastCutoff: false,
        lastId: cursor,
        error: insertError.message,
      };
    }
    staged = inserted?.length ?? 0;
  }

  const newLastId = txIds[txIds.length - 1];
  await setCursor(supabase, newLastId);

  // בהנחת סדר עולה: אם התאריך של העסקה האחרונה בעמוד כבר עבר את untilDate, כל
  // עמוד עתידי יהיה גם הוא כולו אחרי החתך - אין טעם להמשיך לשלוף
  const lastDate = parseNedarimHistoryDate(transactions[transactions.length - 1]?.TransactionTime);
  const pastCutoff = Boolean(options.untilDate && lastDate && lastDate > options.untilDate);

  return {
    ok: true,
    fetched: transactions.length,
    staged,
    skippedDuplicates,
    reachedEnd: transactions.length < maxRows,
    pastCutoff,
    lastId: newLastId,
  };
}
