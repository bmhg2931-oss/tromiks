"use server";

import { Resend } from "resend";

export type SendEmailResult = { ok: boolean; error?: string };

export async function sendCampaignEmail(to: string, subject: string, body: string): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { ok: false, error: "לא הוגדרו RESEND_API_KEY / RESEND_FROM_EMAIL בקובץ .env.local" };

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from, to, subject, text: body || subject });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
