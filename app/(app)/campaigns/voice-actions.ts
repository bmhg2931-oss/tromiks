"use server";

import twilio from "twilio";
import { createClient } from "@/lib/supabase/server";

export type VoiceTokenResult = { ok: true; token: string; callerId: string } | { ok: false; error: string };

// מייצר טוקן גישה זמני ל-Twilio Voice SDK עבור המשתמש המחובר, כדי שיוכל לבצע שיחה
// יוצאת מהדפדפן. הטוקן מוגבל בזמן ואינו נשמר - נוצר מחדש בכל שיחה
export async function getVoiceAccessToken(): Promise<VoiceTokenResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
  const callerId = process.env.TWILIO_CALLER_ID;

  if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid || !callerId) {
    return { ok: false, error: "לא הוגדרו משתני הסביבה של Twilio (TWILIO_ACCOUNT_SID / TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET / TWILIO_TWIML_APP_SID / TWILIO_CALLER_ID) בקובץ .env.local" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "יש להתחבר מחדש" };

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const voiceGrant = new VoiceGrant({ outgoingApplicationSid: twimlAppSid, incomingAllow: false });
  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, { identity: user.id });
  token.addGrant(voiceGrant);

  return { ok: true, token: token.toJwt(), callerId };
}
