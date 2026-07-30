"use server";

import Anthropic from "@anthropic-ai/sdk";
import { ISRAEL_BANKS } from "@/lib/banks";

export type CheckScanResult =
  | { ok: true; bankName: string | null; branchNumber: string; accountNumber: string; checkNumber: string; checkDate: string; amount: string }
  | { ok: false; error: string };

type SupportedMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const SUPPORTED_MEDIA_TYPES: SupportedMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// מנסה למצוא את השם הרשמי המדויק מרשימת הבנקים (כפי שמוצג ב-<select>) - כי AI עשוי
// להחזיר ניסוח מעט שונה משם הבנק המדויק שמוצג בטופס
function matchBankName(guess: string | null | undefined): string | null {
  if (!guess) return null;
  const g = guess.trim();
  if (!g) return null;
  const exact = ISRAEL_BANKS.find((b) => b.name === g || b.code === g);
  if (exact) return exact.name;
  const partial = ISRAEL_BANKS.find((b) => g.includes(b.name) || b.name.includes(g));
  return partial?.name ?? null;
}

export async function extractCheckDetails(imageBase64: string, mediaType: string): Promise<CheckScanResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "לא הוגדר מפתח ANTHROPIC_API_KEY בקובץ .env.local" };
  if (!SUPPORTED_MEDIA_TYPES.includes(mediaType as SupportedMediaType)) {
    return { ok: false, error: "פורמט התמונה לא נתמך - יש להעלות JPG, PNG, GIF או WebP" };
  }

  const anthropic = new Anthropic({ apiKey });
  const bankList = ISRAEL_BANKS.map((b) => `${b.name} (${b.code})`).join(", ");

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType as SupportedMediaType, data: imageBase64 } },
            {
              type: "text",
              text: `זו תמונה שהועלתה על ידי משתמש. ייתכן שזה שיק ישראלי, אבל ייתכן גם שהתמונה מצולמת הפוכה, מסובבת, בזווית, מטושטשת חלקית, או שהיא בכלל לא שיק.

בחן את התמונה בעיון, בדיוק כפי שהיית עושה אם היא הועלתה אליך ישירות בשיחה רגילה: זהה תחילה מה מוצג בתמונה ומהו הכיוון הנכון שלה (לפי כיוון הטקסט המודפס, לוגו הבנק, קווי הכתיבה, מספרי הקידוד בתחתית) - גם אם התמונה מוצגת הפוכה, מסובבת ב-90/180 מעלות, או על הצד. אל תניח שהתמונה בכיוון הנכון רק כי כך היא הועלתה; סובב אותה מנטלית ככל שנדרש כדי לקרוא את הטקסט נכון.

אם זו בבירור לא תמונה של שיק - החזר אך ורק את האובייקט הבא ותו לא:
{"is_check": false, "reason": "<תיאור קצר של מה שכן רואים בתמונה>"}

אם זהו שיק (גם אם מטושטש חלקית, מוצלם בזווית, או הפוך) - החזר אך ורק אובייקט JSON תקין (בלי טקסט נוסף, בלי code fence), עם המפתחות הבאים בדיוק:
{"is_check": true, "bank_name": string|null, "branch_number": string|null, "account_number": string|null, "check_number": string|null, "check_date": "YYYY-MM-DD"|null, "amount": string|null}
- bank_name: שם הבנק כפי שנראה על גבי השיק (גם אם מזוהה מהלוגו בלבד). רשימת הבנקים האפשריים במערכת: ${bankList}
- check_date: תאריך השיק בפורמט YYYY-MM-DD בלבד
- amount: הסכום המספרי בלבד (ללא סימן מטבע), עם נקודה עשרונית אם צריך - אם הסכום כתוב גם במילים וגם בספרות, השווה ביניהם וקח את הגרסה הברורה/הוודאית יותר
נצל את כל הרמזים הזמינים בתמונה (מספור המודפס-מראש בתחתית השיק, חותמות, כתב יד) כדי למקסם דיוק. השאר null רק בשדה שבאמת לא ניתן לקרוא בוודאות גם אחרי בדיקה קפדנית וניסיון לסובב מנטלית את התמונה. אל תמציא ערכים.`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const raw = textBlock?.text ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, error: "לא הצלחתי לפענח את פרטי השיק מהתמונה" };

    const parsed = JSON.parse(jsonMatch[0]) as {
      is_check?: boolean;
      reason?: string;
      bank_name?: string | null;
      branch_number?: string | null;
      account_number?: string | null;
      check_number?: string | null;
      check_date?: string | null;
      amount?: string | null;
    };

    if (parsed.is_check === false) {
      return {
        ok: false,
        error: parsed.reason ? `התמונה שהועלתה לא זוהתה כשיק: ${parsed.reason}` : "התמונה שהועלתה לא זוהתה כשיק",
      };
    }

    return {
      ok: true,
      bankName: matchBankName(parsed.bank_name),
      branchNumber: parsed.branch_number ?? "",
      accountNumber: parsed.account_number ?? "",
      checkNumber: parsed.check_number ?? "",
      checkDate: parsed.check_date ?? "",
      amount: parsed.amount ?? "",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה בפענוח השיק" };
  }
}
