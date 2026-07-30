import { NextResponse } from "next/server";
import twilio from "twilio";

// Webhook שנקרא ישירות ע"י שרתי Twilio (לא ע"י הדפדפן) כשמתבצעת שיחה יוצאת מהצ'אט/הדפדפן -
// זו לכן חייבת להיות נקודת קצה HTTP ציבורית (API Route), לא Server Action, וזו הסיבה היחידה
// שיש כאן חריגה מהמוסכמה של שימוש ב-Server Actions בלבד. ה-URL הזה חייב להיות מוגדר כ-
// Voice Request URL בהגדרות ה-TwiML App בקונסולת Twilio, וזמין רק כשהאתר נגיש ציבורית
// (פריסה, או מנהרה כמו ngrok בפיתוח מקומי) - לא יעבוד מול localhost חשוף בלבד.
export async function POST(request: Request) {
  const formData = await request.formData();
  const to = String(formData.get("To") || "");
  const callerId = process.env.TWILIO_CALLER_ID || "";

  const twiml = new twilio.twiml.VoiceResponse();
  if (to && callerId) {
    twiml.dial({ callerId }, to);
  } else {
    twiml.say({ language: "he-IL" }, "שגיאה: מספר יעד לא תקין");
  }

  return new NextResponse(twiml.toString(), { headers: { "Content-Type": "text/xml" } });
}
